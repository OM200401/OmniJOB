import { describe, expect, test } from "bun:test";
import { classifyIndustry } from "./industry";

describe("classifyIndustry", () => {
  test("identifies tech roles", () => {
    expect(classifyIndustry("Senior Software Engineer").industry).toBe("tech");
    expect(classifyIndustry("Backend Developer, Distributed Systems").industry).toBe("tech");
    expect(classifyIndustry("Staff ML Engineer").industry).toBe("tech");
    expect(classifyIndustry("Site Reliability Engineer III").industry).toBe("tech");
    expect(classifyIndustry("DevOps Engineer").industry).toBe("tech");
  });

  test("identifies healthcare roles", () => {
    expect(classifyIndustry("Registered Nurse").industry).toBe("healthcare");
    expect(classifyIndustry("Charge Nurse, ICU").industry).toBe("healthcare");
    expect(classifyIndustry("Emergency Physician").industry).toBe("healthcare");
    expect(classifyIndustry("Pharmacy Technician").industry).toBe("healthcare");
    expect(classifyIndustry("Phlebotomist").industry).toBe("healthcare");
    expect(classifyIndustry("Dental Hygienist").industry).toBe("healthcare");
    expect(classifyIndustry("Physical Therapist").industry).toBe("healthcare");
  });

  test("identifies government roles", () => {
    expect(classifyIndustry("Deputy Sheriff").industry).toBe("government");
    expect(classifyIndustry("Police Officer").industry).toBe("government");
    expect(classifyIndustry("IT Specialist GS-13").industry).toBe("government");
    expect(classifyIndustry("Civil Service Analyst").industry).toBe("government");
  });

  test("identifies retail roles", () => {
    expect(classifyIndustry("Cashier").industry).toBe("retail");
    expect(classifyIndustry("Sales Associate, Apparel").industry).toBe("retail");
    expect(classifyIndustry("Store Manager").industry).toBe("retail");
    expect(classifyIndustry("Visual Merchandiser").industry).toBe("retail");
  });

  test("identifies food service roles", () => {
    expect(classifyIndustry("Line Cook").industry).toBe("food_service");
    expect(classifyIndustry("Sous Chef").industry).toBe("food_service");
    expect(classifyIndustry("Bartender").industry).toBe("food_service");
    expect(classifyIndustry("Barista").industry).toBe("food_service");
  });

  test("identifies trades roles", () => {
    expect(classifyIndustry("Journeyman Electrician").industry).toBe("trades");
    expect(classifyIndustry("HVAC Technician").industry).toBe("trades");
    expect(classifyIndustry("Master Plumber").industry).toBe("trades");
    expect(classifyIndustry("Carpenter").industry).toBe("trades");
  });

  test("identifies logistics roles", () => {
    expect(classifyIndustry("CDL A Truck Driver").industry).toBe("logistics");
    expect(classifyIndustry("Warehouse Associate").industry).toBe("logistics");
    expect(classifyIndustry("Delivery Driver").industry).toBe("logistics");
  });

  test("identifies education roles", () => {
    expect(classifyIndustry("Elementary School Teacher").industry).toBe("education");
    expect(classifyIndustry("Adjunct Faculty, Mathematics").industry).toBe("education");
    expect(classifyIndustry("Special Education Teacher").industry).toBe("education");
  });

  test("identifies finance roles", () => {
    expect(classifyIndustry("Senior Accountant").industry).toBe("finance");
    expect(classifyIndustry("Financial Analyst").industry).toBe("finance");
    expect(classifyIndustry("Loan Officer").industry).toBe("finance");
  });

  test("returns 'other' when no rule matches", () => {
    expect(classifyIndustry("Roving Operations Coordinator").industry).toBe("other");
    expect(classifyIndustry("").industry).toBe("other");
  });

  test("returns job family for high-confidence matches", () => {
    expect(classifyIndustry("Registered Nurse").jobFamily).toBe("registered_nurse");
    expect(classifyIndustry("Senior Software Engineer").jobFamily).toBe("software_engineering");
    expect(classifyIndustry("Cashier").jobFamily).toBe("cashier");
    expect(classifyIndustry("Pharmacy Technician").jobFamily).toBe("pharmacy_technician");
  });

  test("uses description as fallback when title is ambiguous", () => {
    // "Specialist" alone is too generic. A medical context in the description
    // should still surface healthcare.
    const out = classifyIndustry(
      "Specialist",
      "Reports to the Charge Nurse. Provides patient care in the ICU.",
    );
    expect(out.industry).toBe("healthcare");
  });

  test("most specific industry wins over generic tech overlap", () => {
    // "Medical Software Engineer" could match both. Healthcare rules run
    // first so it should tag as healthcare, not tech.
    const out = classifyIndustry("Medical Software Engineer at Hospital");
    expect(out.industry).toBe("healthcare");
  });
});
