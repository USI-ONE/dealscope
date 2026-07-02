/**
 * Industry taxonomy for diligence engagements.
 *
 * The dropdown on the New Engagement form is populated from this list.
 * Each industry drives a set of industry-specific questions in
 * `question-library.ts` — universal IT questions are asked of every
 * engagement; industry-specific blocks are merged in based on the
 * selected industry.
 *
 * Adding a new industry: append to INDUSTRY_ENUM_VALUES, add a label,
 * and (optionally) add a question block in question-library.ts. Until
 * a specific block exists, the engagement still gets a generic
 * "Industry tools & lead-to-cash" prompt set.
 */
export const INDUSTRY_ENUM_VALUES = [
  "accounting_finance",
  "agriculture",
  "architecture_engineering",
  "automotive_collision_repair",
  "automotive_dealer",
  "automotive_repair",
  "behavioral_health",
  "biotech_pharma",
  "childcare",
  "construction_general",
  "construction_specialty",
  "dental",
  "distribution_wholesale",
  "ecommerce",
  "education_higher",
  "education_k12",
  "education_other",
  "energy_utilities",
  "faith_religious",
  "financial_advisory",
  "fitness_wellness",
  "food_beverage_production",
  "funeral_services",
  "government_local",
  "government_state",
  "healthcare_practice",
  "home_services",
  "hospitality",
  "hotel_lodging",
  "insurance",
  "it_services_msp",
  "legal_services",
  "logistics_3pl",
  "manufacturing_discrete",
  "manufacturing_process",
  "marketing_agency",
  "media_broadcast",
  "media_production",
  "mining_aggregates",
  "nonprofit",
  "oil_gas",
  "pet_services",
  "pharmacy",
  "professional_services",
  "property_management",
  "real_estate_brokerage",
  "recreation_entertainment",
  "restaurant_full_service",
  "restaurant_qsr",
  "retail_brick_mortar",
  "salon_spa",
  "security_services",
  "senior_living",
  "staffing_recruiting",
  "technology_software",
  "telecom_carrier",
  "transportation_freight",
  "transportation_passenger",
  "veterinary",
  "waste_management",
  "other",
] as const;

export type Industry = (typeof INDUSTRY_ENUM_VALUES)[number];

export const INDUSTRY_LABELS: Record<Industry, string> = {
  accounting_finance: "Accounting / Finance / Tax",
  agriculture: "Agriculture",
  architecture_engineering: "Architecture / Engineering",
  automotive_collision_repair: "Automotive — Collision / Body shop",
  automotive_dealer: "Automotive — Dealership",
  automotive_repair: "Automotive — Mechanical repair / Tire / Service",
  behavioral_health: "Behavioral health",
  biotech_pharma: "Biotech / Pharma",
  childcare: "Childcare",
  construction_general: "Construction — General contractor",
  construction_specialty: "Construction — Specialty trade",
  dental: "Dental",
  distribution_wholesale: "Distribution / Wholesale",
  ecommerce: "E-commerce",
  education_higher: "Education — Higher ed",
  education_k12: "Education — K-12",
  education_other: "Education — Other (training, daycare, etc.)",
  energy_utilities: "Energy / Utilities",
  faith_religious: "Faith / Religious organization",
  financial_advisory: "Financial advisory / Wealth management",
  fitness_wellness: "Fitness / Wellness",
  food_beverage_production: "Food & beverage production",
  funeral_services: "Funeral services",
  government_local: "Government — Local / Municipal",
  government_state: "Government — State / Federal",
  healthcare_practice: "Healthcare — Practice / Clinic",
  home_services: "Home services (HVAC / plumbing / electrical / etc.)",
  hospitality: "Hospitality / Events",
  hotel_lodging: "Hotel / Lodging",
  insurance: "Insurance — Agency / Broker",
  it_services_msp: "IT services / MSP",
  legal_services: "Legal services",
  logistics_3pl: "Logistics / 3PL / Warehouse",
  manufacturing_discrete: "Manufacturing — Discrete",
  manufacturing_process: "Manufacturing — Process",
  marketing_agency: "Marketing / Advertising agency",
  media_broadcast: "Media — Broadcast",
  media_production: "Media — Production / Post",
  mining_aggregates: "Mining / Aggregates",
  nonprofit: "Nonprofit",
  oil_gas: "Oil & gas",
  pet_services: "Pet services (boarding / grooming / daycare)",
  pharmacy: "Pharmacy",
  professional_services: "Professional services / Consulting",
  property_management: "Property management",
  real_estate_brokerage: "Real estate brokerage",
  recreation_entertainment: "Recreation / Entertainment",
  restaurant_full_service: "Restaurant — Full service",
  restaurant_qsr: "Restaurant — Quick-service",
  retail_brick_mortar: "Retail — Brick & mortar",
  salon_spa: "Salon / Spa",
  security_services: "Security services / Alarm",
  senior_living: "Senior living / Long-term care",
  staffing_recruiting: "Staffing / Recruiting",
  technology_software: "Technology / Software",
  telecom_carrier: "Telecom carrier",
  transportation_freight: "Transportation — Freight / Trucking",
  transportation_passenger: "Transportation — Passenger / NEMT",
  veterinary: "Veterinary",
  waste_management: "Waste management",
  other: "Other (specify)",
};

/**
 * Stable ordering for the dropdown — alphabetical by label, but with
 * "Other" pinned to the bottom.
 */
export const INDUSTRIES_FOR_DROPDOWN: Industry[] = (() => {
  const all = [...INDUSTRY_ENUM_VALUES] as Industry[];
  const sorted = all
    .filter((i) => i !== "other")
    .sort((a, b) => INDUSTRY_LABELS[a].localeCompare(INDUSTRY_LABELS[b]));
  return [...sorted, "other"];
})();
