type OrderLookup = {
  customerName: string;
  destination: string;
  upsTrackingNumber: string;
};

export type ProgressKey = "production" | "transit" | "local" | "outfordelivery" | "delivered";

export type CustomGearTracking = {
  customerName: string;
  destination: string;
  status: string; // raw UPS-ish status text
  estimatedDelivery: string; // raw ETA text
  progressKey: ProgressKey;
  message: string; // customer-friendly message
  eta: string; // display ETA (empty if unavailable)
};

const GOOGLE_SHEET_ID = process.env.CUSTOMGEAR_GOOGLE_SHEET_ID || "1Q5oH_842W7mfBrcm30APhbQXvpEaO5n0vIK68MVtoF0";
const GOOGLE_SHEET_NAME = process.env.CUSTOMGEAR_GOOGLE_SHEET_NAME || "Sheet1";
const GOOGLE_SHEET_GID = process.env.CUSTOMGEAR_GOOGLE_SHEET_GID || "";
const GOOGLE_SHEET_GVIZ_JSON_URL =
  process.env.CUSTOMGEAR_GOOGLE_SHEET_GVIZ_JSON_URL ||
  `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(
    GOOGLE_SHEET_NAME
  )}${GOOGLE_SHEET_GID ? `&gid=${encodeURIComponent(GOOGLE_SHEET_GID)}` : ""}`;

const APPS_SCRIPT_URL = process.env.CUSTOMGEAR_APPS_SCRIPT_URL || "";

const GOOGLE_SHEET_CACHE_TTL_MS = 5 * 60 * 1000;

let sheetCache:
  | {
      fetchedAt: number;
      ordersByCode: Map<string, OrderLookup>;
    }
  | undefined;

const UPS_STATUS_CACHE_TTL_MS = 2 * 60 * 1000;
const upsStatusCache = new Map<
  string,
  { fetchedAt: number; status: CustomGearTracking["status"]; estimatedDelivery: CustomGearTracking["estimatedDelivery"] }
>();

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

function normalizeCell(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function cleanGvizCell(cell: unknown): string {
  // Google Visualization query returns cells as objects like {v: "..."} or {f: "..."}.
  if (cell == null) return "";
  if (typeof cell === "string") return cell.trim();
  if (typeof cell !== "object") return "";
  const anyCell = cell as Record<string, unknown>;

  const v = anyCell["v"];
  const f = anyCell["f"];
  if (typeof v === "string" || typeof v === "number") return normalizeCell(v);
  if (typeof f === "string" || typeof f === "number") return normalizeCell(f);
  return "";
}

async function getOrdersFromGoogleSheet(): Promise<Map<string, OrderLookup>> {
  const now = Date.now();
  if (sheetCache && now - sheetCache.fetchedAt < GOOGLE_SHEET_CACHE_TTL_MS) return sheetCache.ordersByCode;

  let text: string;
  try {
    const res = await fetch(GOOGLE_SHEET_GVIZ_JSON_URL, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Google Sheet lookup failed (${res.status}).`);
    }
    text = await res.text();
  } catch {
    throw new Error(
      "Google Sheet unreachable. Ensure `CUSTOMGEAR_GOOGLE_SHEET_ID` / `CUSTOMGEAR_GOOGLE_SHEET_NAME` are correct and your server allows outbound HTTPS."
    );
  }

  // Match: google.visualization.Query.setResponse(<json>);
  const match = text.match(/google\.visualization\.Query\.setResponse\((.*)\);/s);
  if (!match || !match[1]) {
    throw new Error("Could not parse the Google Sheet response.");
  }

  const data = JSON.parse(match[1]) as any;
  const rows: any[] = data?.table?.rows || [];
  if (!rows.length) throw new Error("No rows found in the Google Sheet.");

  const headerRow: string[] = (rows[0]?.c || []).map(cleanGvizCell);

  const normalizeHeader = (v: unknown) => cleanGvizCell(v).trim().toLowerCase();
  const findHeaderIndex = (options: string[]) => {
    const normalizedHeaders = headerRow.map((h) => h.trim().toLowerCase());
    const normalizedOptions = options.map((o) => o.trim().toLowerCase());
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (normalizedOptions.includes(normalizedHeaders[i] || "")) return i;
    }
    return -1;
  };

  const codeIndex = findHeaderIndex(["Client Number", "Client Code", "Code", "Code ID"]);
  const nameIndex = findHeaderIndex(["Name", "Client Name", "Customer Name"]);
  const destinationIndex = findHeaderIndex(["Destination", "City", "Ship To", "Destination City"]);
  const trackingIndex = findHeaderIndex(["UPS Tracking", "USP tracking", "Tracking", "Tracking Number"]);

  // If we can’t find the headers, fall back to fixed columns A-D (0..3) as a last resort.
  const ordersByCode = new Map<string, OrderLookup>();
  const fallback =
    codeIndex === -1 || nameIndex === -1 || destinationIndex === -1 || trackingIndex === -1;

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]?.c || [];

    const customerName = fallback ? cleanGvizCell(cells[0]) : cleanGvizCell(cells[nameIndex]);
    const destination = fallback ? cleanGvizCell(cells[1]) : cleanGvizCell(cells[destinationIndex]);
    const upsTrackingNumber = fallback ? cleanGvizCell(cells[2]) : cleanGvizCell(cells[trackingIndex]);
    const clientNumber = fallback ? cleanGvizCell(cells[3]) : cleanGvizCell(cells[codeIndex]);

    if (!clientNumber) continue;
    if (!upsTrackingNumber) continue;

    ordersByCode.set(normalizeCode(clientNumber), { customerName, destination, upsTrackingNumber });
  }

  sheetCache = { fetchedAt: now, ordersByCode };
  return ordersByCode;
}

const CUSTOMS_PATTERNS = [
  /government agenc/i,
  /customs authority/i,
  /customs clearance/i,
  /cleared customs/i,
  /held by customs/i,
  /released by customs/i,
  /transferred to.*customs/i,
  /customs/i,
  /import scan/i,
  /export scan/i,
  /regulatory requirement/i,
  /border/i,
];

function sanitizeMessage(message: string, progressKey: ProgressKey): string {
  const lower = message.toLowerCase();
  const isCustomsRelated = CUSTOMS_PATTERNS.some((p) => p.test(lower));
  if (!isCustomsRelated) return message;

  switch (progressKey) {
    case "delivered":
      return "Your shipment has been delivered.";
    case "outfordelivery":
      return "Your order is out for delivery.";
    case "local":
      return "Your shipment has arrived in the destination area.";
    case "transit":
      return "Your shipment is progressing through the shipping network.";
    default:
      return "Your order is being processed.";
  }
}

function isProgressKey(v: string): v is ProgressKey {
  return v === "production" || v === "transit" || v === "local" || v === "outfordelivery" || v === "delivered";
}

function progressKeyFromStatusText(status: string): ProgressKey {
  const s = (status || "").toLowerCase();
  if (isProgressKey(status)) return status;
  if (s.includes("delivered")) return "delivered";
  if (s.includes("out for delivery") || s.includes("outfordelivery")) return "outfordelivery";
  if (s.includes("arrived") && (s.includes("destination") || s.includes("local") || s.includes("facility"))) return "local";
  if (s.includes("in transit") || s.includes("transit")) return "transit";
  return "production";
}

function findFirstStringByKeys(obj: unknown, keys: string[]): string | undefined {
  const keySet = new Set(keys.map((k) => k.toLowerCase()));
  const seen = new Set<object>();

  const walk = (value: unknown): string | undefined => {
    if (value == null) return undefined;
    if (typeof value !== "object") return undefined;
    if (seen.has(value as object)) return undefined;
    seen.add(value as object);

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = walk(item);
        if (found) return found;
      }
      return undefined;
    }

    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const lk = k.toLowerCase();
      if (keySet.has(lk)) {
        if (typeof v === "string") {
          const s = v.trim();
          if (s) return s;
        }
        if (Array.isArray(v)) {
          for (const item of v) {
            if (typeof item === "string") {
              const s = item.trim();
              if (s) return s;
            }
          }
        }
      }

      const found = walk(v);
      if (found) return found;
    }

    return undefined;
  };

  return walk(obj);
}

async function fetchUpsTrackingStatus(upsTrackingNumber: string): Promise<{ status: string; estimatedDelivery: string }> {
  const cached = upsStatusCache.get(upsTrackingNumber);
  if (cached && Date.now() - cached.fetchedAt < UPS_STATUS_CACHE_TTL_MS) {
    return { status: cached.status, estimatedDelivery: cached.estimatedDelivery };
  }

  // UPS can be integrated in multiple ways. We support:
  // 1) "GetStatus" JSON endpoint (often works with just tracking number)
  // 2) "onlinetools.ups.com/json/Track" endpoint when you provide UPS credentials.
  // You must set UPS env vars if the first method fails.

  const getStatusUrl = process.env.UPS_GETSTATUS_URL || "https://www.ups.com/track/api/Track/GetStatus";
  const locale = process.env.UPS_LOCALE || "en_US";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  // Try GetStatus first (no credentials).
  try {
    const res = await fetch(getStatusUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ Locale: locale, TrackingNumber: [upsTrackingNumber] }),
    });

    if (res.ok) {
      const json = (await res.json().catch(() => null)) as unknown;
      const status =
        findFirstStringByKeys(json, ["status", "lateststatus", "statusdescription", "activitydescription", "eventdescription"]) ||
        "Status unavailable";
      const estimatedDelivery =
        findFirstStringByKeys(json, ["estimateddeliverydate", "guaranteeddeliverydate", "deliverydate", "expecteddeliverydate"]) ||
        "Estimated delivery unavailable";

      upsStatusCache.set(upsTrackingNumber, { fetchedAt: Date.now(), status, estimatedDelivery });
      return { status, estimatedDelivery };
    }
  } catch {
    // fall through to credential-based method
  }

  const upsUser = process.env.UPS_USERNAME;
  const upsPassword = process.env.UPS_PASSWORD;
  const upsAccessLicenseNumber = process.env.UPS_ACCESS_LICENSE_NUMBER;

  if (!upsUser || !upsPassword || !upsAccessLicenseNumber) {
    throw new Error(
      "UPS tracking is not configured. Set UPS_USERNAME, UPS_PASSWORD, and UPS_ACCESS_LICENSE_NUMBER (or UPS_GETSTATUS_URL if needed)."
    );
  }

  const trackUrl = process.env.UPS_TRACK_JSON_URL || "https://onlinetools.ups.com/json/Track";

  let res: Response;
  try {
    res = await fetch(trackUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        Security: {
          UsernameToken: { Username: upsUser, Password: upsPassword },
          UPSServiceAccessToken: { AccessLicenseNumber: upsAccessLicenseNumber },
        },
        TrackRequest: {
          Request: { RequestAction: "Track", RequestOption: "activity" },
          InquiryNumber: upsTrackingNumber,
        },
      }),
    });
  } catch {
    throw new Error(
      "UPS unreachable. Ensure your server allows outbound HTTPS and the UPS tracking endpoint/credentials are correct."
    );
  }

  if (!res.ok) {
    throw new Error(`UPS tracking lookup failed (${res.status}).`);
  }

  const json = (await res.json().catch(() => null)) as unknown;
  const status =
    findFirstStringByKeys(json, ["status", "lateststatus", "statusdescription", "activitydescription", "eventdescription"]) ||
    "Status unavailable";
  const estimatedDelivery =
    findFirstStringByKeys(json, ["estimateddeliverydate", "guaranteeddeliverydate", "deliverydate", "expecteddeliverydate"]) ||
    "Estimated delivery unavailable";

  upsStatusCache.set(upsTrackingNumber, { fetchedAt: Date.now(), status, estimatedDelivery });
  return { status, estimatedDelivery };
}

export async function getCustomGearTracking(code: string): Promise<CustomGearTracking> {
  // Preferred path: your Apps Script can do Sheet lookup + UPS call and return only what the customer needs.
  if (APPS_SCRIPT_URL) {
    try {
      const res = await fetch(`${APPS_SCRIPT_URL}?code=${encodeURIComponent(code)}`, {
        method: "GET",
      });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as any;
        if (data && (data.found === true || data.found === "true" || data.found === 1)) {
          const customerName = data.customerName || data.clientName || data.name || "";
          const destination = data.destination || data.shipTo || data.clientDestination || "";
          const upsData = data.upsData || data.ups || data.trackingData || data;

          const statusText = String(upsData?.status || data.status || "");
          const etaRaw = String(upsData?.eta || upsData?.estimatedDelivery || data.eta || upsData?.deliveryDate || "");
          const messageText = String(upsData?.message || upsData?.messageText || data.message || statusText || "");

          const progressKey = progressKeyFromStatusText(statusText);
          const eta =
            !etaRaw || etaRaw.toLowerCase().includes("unavailable") ? "" : etaRaw;
          const rawMessage = messageText || statusText || "Shipment in progress.";

          return {
            customerName: customerName || "—",
            destination: destination || "—",
            status: statusText || "Shipment in progress.",
            estimatedDelivery: eta,
            progressKey,
            message: sanitizeMessage(rawMessage, progressKey),
            eta,
          };
        }
      }
    } catch {
      // Ignore and fall back to direct lookups.
    }
  }

  // Fallback path: Sheet -> UPS API
  const ordersByCode = await getOrdersFromGoogleSheet();
  const order = ordersByCode.get(normalizeCode(code));

  if (!order) {
    throw new Error("No order found for that code.");
  }

  const ups = await fetchUpsTrackingStatus(order.upsTrackingNumber);

  const statusText = ups.status || "";
  const progressKey = progressKeyFromStatusText(statusText);

  const etaUnavailable =
    !ups.estimatedDelivery ||
    ups.estimatedDelivery.toLowerCase().includes("unavailable") ||
    ups.estimatedDelivery === "Estimated delivery unavailable";

  const eta = etaUnavailable ? "" : ups.estimatedDelivery;
  const rawMessage = statusText || "Shipment in progress.";

  return {
    customerName: order.customerName || "—",
    destination: order.destination || "—",
    status: statusText,
    estimatedDelivery: ups.estimatedDelivery,
    progressKey,
    message: sanitizeMessage(rawMessage, progressKey),
    eta,
  };
}

