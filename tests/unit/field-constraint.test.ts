import { describe, expect, it } from "vitest";
import {
  CONSTRAINT_ANY,
  constrainedFromLegacy,
  flexConstraintScore,
  isHardConstrained,
  isFlexConstrained,
  parseStrength,
  passesHardConstraint,
} from "@/lib/field-constraint";
import {
  resolveLevelConstraint,
  resolvePlaceCityConstraint,
  resolveWhenConstraint,
} from "@/lib/wish-constraints";

describe("field-constraint", () => {
  it("maps legacy any/strict into constrained values", () => {
    expect(constrainedFromLegacy({ anyFlag: true }).value).toBe(CONSTRAINT_ANY);
    const hard = constrainedFromLegacy({ value: "weekend", strictFlag: true });
    expect(isHardConstrained(hard)).toBe(true);
    const flex = constrainedFromLegacy({ value: "weekend" });
    expect(isFlexConstrained(flex)).toBe(true);
  });

  it("parses strength tokens", () => {
    expect(parseStrength("最好")).toBe("flex");
    expect(parseStrength("必须")).toBe("hard");
    expect(parseStrength("flex")).toBe("flex");
  });

  it("hard gate and flex score", () => {
    const hard = constrainedFromLegacy({ value: "beijing", strength: "hard" });
    expect(passesHardConstraint(hard, false)).toBe(false);
    expect(passesHardConstraint(hard, true)).toBe(true);
    const flex = constrainedFromLegacy({ value: "beijing", strength: "flex" });
    expect(passesHardConstraint(flex, false)).toBe(true);
    expect(flexConstraintScore(flex, true, 3, -1)).toBe(3);
    expect(flexConstraintScore(flex, false, 3, -1)).toBe(-1);
  });
});

describe("wish-constraints", () => {
  it("resolves when from legacy flags", () => {
    expect(resolveWhenConstraint({ whenAny: true }).value).toBe(CONSTRAINT_ANY);
    const c = resolveWhenConstraint({ when: "weekend", strictWhen: true });
    expect(c.strength).toBe("hard");
    const soft = resolveWhenConstraint({ when: "weekend" });
    expect(soft.strength).toBe("flex");
  });

  it("resolves place city strength default hard", () => {
    const c = resolvePlaceCityConstraint({ place: { city: "beijing" } });
    expect(c.value).toBe("beijing");
    expect(c.strength).toBe("hard");
    const flex = resolvePlaceCityConstraint({
      place: { city: "beijing" },
      placeStrength: "flex",
    });
    expect(flex.strength).toBe("flex");
  });

  it("resolves level any", () => {
    expect(resolveLevelConstraint({ levelAny: true }).value).toBe(CONSTRAINT_ANY);
  });
});
