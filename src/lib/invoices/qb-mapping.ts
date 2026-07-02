/**
 * TechOS invoice line category → QuickBooks (Enterprise 25 / Desktop)
 * item name + income account name.
 *
 * Built from USI's actual QB Item List (Lists → File → Export → IIF
 * Files, 2026-05-21) and Chart of Accounts. Item names use the full
 * QB hierarchy with ':' separators because that's how QB resolves
 * items on IIF import — partial names create duplicate items.
 *
 * Caller note: the IIF import in QBD will REJECT a line whose ACCNT or
 * INVITEM doesn't already exist in the company file. Every name in
 * this file has been verified present in the 2026-05-21 export.
 */
import "server-only";
import type { InvoiceLine } from "@/db/schema";

type Mapping = {
  /** Full hierarchical QB item name. */
  itemName: string;
  /** Income account the line credits. Must match QB's chart exactly. */
  incomeAccount: string;
};

/**
 * Resolve a category + optional description hint to a QB item + account.
 *
 * `description` is consulted for license / service rows so a "Microsoft
 * 365 …" license can be split from a "SentinelOne …" license without
 * any per-row mapping table. It's case-insensitive substring matching;
 * if we add another product family the heuristic is one line.
 */
export function mapLineToQb(line: InvoiceLine): Mapping {
  switch (line.category) {
    case "support_baseline":
      // No dedicated baseline item in QB; bill against the same
      // Contract Sales account but use the generic "Professional
      // Service:PS" parent so it shows up under the right group.
      return {
        itemName: "Professional Service:PS",
        incomeAccount: "Contract Sales",
      };

    case "support_tier":
      return mapSupportTier(line.description);

    case "license_microsoft":
      return {
        itemName: "Service:M365 Subscription",
        incomeAccount: "Software Sales:Cloud Subscription Sales",
      };

    case "license_third_party":
      return mapThirdPartyLicense(line.description, line.detail);

    case "service_recurring":
      return mapRecurringService(line.description);

    case "variable_charge":
      return mapVariableCharge(line.description);

    case "hardware":
      return mapHardware(line.description, line.detail);

    case "shipping":
      return {
        itemName: "Shipping",
        incomeAccount: "Shipping and Handling",
      };

    case "tax":
      // Tax lines are emitted as a TRNS-level field in IIF, not as a
      // regular SPL. This fallback is here only so a misclassified
      // row doesn't crash the export.
      return {
        itemName: "Sales Tax",
        incomeAccount: "Sales Tax Payable",
      };

    case "discount":
      return {
        itemName: "Sales Discount",
        incomeAccount: "Sales Discount",
      };

    case "other":
    default:
      return {
        itemName: "Professional Service:PS",
        incomeAccount: "Contract Sales",
      };
  }
}

/* -------------------- Support tier (the core MSP billing) ---------- */
function mapSupportTier(description: string): Mapping {
  const d = description.toLowerCase();
  if (d.includes("full compute") || d.includes("compute node")) {
    return {
      itemName: "Professional Service:PS:PS / Compute Node",
      incomeAccount: "Contract Sales",
    };
  }
  if (
    d.includes("kiosk") ||
    d.includes("virtual machine") ||
    d.includes("managed mobile")
  ) {
    return {
      itemName: "Professional Service:PS:PS / Device",
      incomeAccount: "Contract Sales",
    };
  }
  if (d.includes("additional user") || d.includes("user")) {
    return {
      itemName: "Professional Service:PS:PS / User",
      incomeAccount: "Contract Sales",
    };
  }
  return {
    itemName: "Professional Service:PS",
    incomeAccount: "Contract Sales",
  };
}

/* -------------------- Third-party license ------------------------ */
function mapThirdPartyLicense(
  description: string,
  detail: string | null,
): Mapping {
  const blob = `${description} ${detail ?? ""}`.toLowerCase();
  if (
    blob.includes("sentinelone") ||
    blob.includes("threatlocker") ||
    blob.includes("crowdstrike") ||
    blob.includes("defender") ||
    blob.includes("edr") ||
    blob.includes("antivirus")
  ) {
    return {
      itemName: "Service",
      incomeAccount: "Software Sales:Security Sales",
    };
  }
  // Default for SaaS-shaped third-party rebills.
  return {
    itemName: "Service",
    incomeAccount: "Software Sales:Cloud Subscription Sales",
  };
}

/* -------------------- Recurring services ------------------------- */
function mapRecurringService(description: string): Mapping {
  const d = description.toLowerCase();
  if (
    d.includes("internet") ||
    d.includes("fiber") ||
    d.includes("dsl") ||
    d.includes("comcast") ||
    d.includes("centurylink")
  ) {
    // Internet / connectivity → contract revenue (USI re-bills at markup).
    return {
      itemName: "Service",
      incomeAccount: "Contract Sales",
    };
  }
  if (d.includes("backup") || d.includes("infrascale")) {
    return {
      itemName: "Service",
      incomeAccount: "Software Sales:Cloud Subscription Sales",
    };
  }
  if (d.includes("voip") || d.includes("phone") || d.includes("teams calling")) {
    return {
      itemName: "Service",
      incomeAccount: "Contract Sales",
    };
  }
  return {
    itemName: "Service",
    incomeAccount: "Contract Sales",
  };
}

/* -------------------- Variable charges --------------------------- */
function mapVariableCharge(description: string): Mapping {
  const d = description.toLowerCase();
  if (
    d.includes("hourly") ||
    d.includes("after-hours") ||
    d.includes("after hours") ||
    d.includes("emergency")
  ) {
    return {
      itemName: "Professional Service:PS:PS Hourly",
      incomeAccount: "Projects Sales:On Site Service",
    };
  }
  if (d.includes("project") || d.includes("installation") || d.includes("rollout")) {
    return {
      itemName: "Professional Service:PS:PS Project",
      incomeAccount: "Projects Sales:Project - IT",
    };
  }
  if (d.includes("travel") || d.includes("mileage")) {
    return {
      itemName: "Professional Service:PS:PS Survey - Travel",
      incomeAccount: "Travel Sales",
    };
  }
  // Default — hourly is the safest "we did something for them" bucket.
  return {
    itemName: "Professional Service:PS:PS Hourly",
    incomeAccount: "Projects Sales:On Site Service",
  };
}

/* -------------------- Hardware ----------------------------------- */
function mapHardware(description: string, sku: string | null): Mapping {
  const blob = `${description} ${sku ?? ""}`.toLowerCase();

  // Brand-first wins because Lenovo/HP/Apple have dedicated accounts.
  if (blob.includes("lenovo")) {
    return {
      itemName: "Hardware:Lenovo",
      incomeAccount: "Hardware Sales:Lenovo Sales",
    };
  }
  if (blob.includes("hp ") || blob.includes("hewlett")) {
    return {
      itemName: "Hardware:HP",
      incomeAccount: "Hardware Sales:HP Sales",
    };
  }
  if (
    blob.includes("apple") ||
    blob.includes("macbook") ||
    blob.includes("ipad") ||
    blob.includes("imac")
  ) {
    return {
      itemName: "Hardware:Apple",
      incomeAccount: "Hardware Sales:Apple Sales",
    };
  }
  // Form-factor heuristics for everything else.
  if (
    blob.includes("notebook") ||
    blob.includes("laptop") ||
    blob.includes("thinkpad")
  ) {
    return {
      itemName: "Hardware:Notebook",
      incomeAccount: "Hardware Sales:Notebook Sales",
    };
  }
  if (
    blob.includes("monitor") ||
    blob.includes("display") ||
    blob.includes("lcd")
  ) {
    return {
      itemName: "Hardware:Monitor",
      incomeAccount: "Hardware Sales:Monitor Sales",
    };
  }
  if (blob.includes("ups") || blob.includes("battery backup")) {
    return {
      itemName: "Hardware:UPS",
      incomeAccount: "Hardware Sales:UPS Sales",
    };
  }
  if (
    blob.includes("switch") ||
    blob.includes("firewall") ||
    blob.includes("router") ||
    blob.includes("access point") ||
    blob.includes("network")
  ) {
    return {
      itemName: "Hardware:Network",
      incomeAccount: "Hardware Sales:Network Hardware Sales",
    };
  }
  if (
    blob.includes("cable") ||
    blob.includes("patch") ||
    blob.includes("rj45")
  ) {
    return {
      itemName: "Hardware:Cables",
      incomeAccount: "Hardware Sales:Cables Sales",
    };
  }
  if (
    blob.includes("phone") &&
    !blob.includes("phones") /* keep "phone sales" out of generic */
  ) {
    return {
      itemName: "Hardware:Phone",
      incomeAccount: "Hardware Sales:Phone Sales",
    };
  }
  // Catch-all — Special Order tends to be the right home for one-off
  // hardware that doesn't match a brand or form-factor bucket.
  return {
    itemName: "Hardware:Special Order",
    incomeAccount: "Special Order Sales",
  };
}
