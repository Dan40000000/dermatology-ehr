import {
  parseFields,
  filterFields,
  filterFieldsArray,
  fieldSelectionMiddleware,
  buildSelectClause,
} from "../fieldSelection";

describe("fieldSelection utilities", () => {
  it("parseFields returns null without fields", () => {
    const req = { query: {} } as any;
    expect(parseFields(req)).toBeNull();
  });

  it("parseFields trims values", () => {
    const req = { query: { fields: "id, firstName, lastName" } } as any;
    expect(parseFields(req)).toEqual(["id", "firstName", "lastName"]);
  });

  it("filterFields returns original when no fields", () => {
    const obj = { id: "1", name: "Pat" };
    expect(filterFields(obj, null)).toEqual(obj);
  });

  it("filterFields returns selected fields", () => {
    const obj = { id: "1", name: "Pat", extra: "skip" };
    expect(filterFields(obj, ["id", "name"])).toEqual({ id: "1", name: "Pat" });
  });

  it("filterFieldsArray maps selections", () => {
    const list = [{ id: "1", name: "A" }, { id: "2", name: "B" }];
    expect(filterFieldsArray(list, ["id"])).toEqual([{ id: "1" }, { id: "2" }]);
  });

  it("fieldSelectionMiddleware attaches selectedFields", () => {
    const req = { query: { fields: "id" } } as any;
    const next = jest.fn();
    fieldSelectionMiddleware(req, {} as any, next);
    expect(req.selectedFields).toEqual(["id"]);
    expect(next).toHaveBeenCalled();
  });

  it("buildSelectClause returns default when empty", () => {
    expect(buildSelectClause(null, "id, name")).toBe("id, name");
  });

  it("buildSelectClause maps fields with aliases", () => {
    const clause = buildSelectClause(["firstName", "lastName"], "id");
    expect(clause).toBe('first_name as "firstName", last_name as "lastName"');
  });

  it("buildSelectClause uses custom mapping", () => {
    const clause = buildSelectClause(["primary"], "id", { primary: "p.primary_id" });
    expect(clause).toBe("p.primary_id");
  });

  it("buildSelectClause rejects fields outside allowlist", () => {
    expect(() => buildSelectClause(["bad"], "id", undefined, ["id"])).toThrow(
      "Invalid fields requested: bad"
    );
  });
});
