import { goalCatalog, searchGoals, type CatalogItem } from "./goals";
// Preserve established field keys so existing experience/recommendation matches survive.
// Long certification names use the catalog's short stable ID within the 30-character DB limit.
const legacyKeys: Record<string, string> = {
  "cert-ipa-fe": "基本情報",
  "cert-ipa-ap": "応用情報",
  "tech-aws": "AWS",
};
export function learningFieldKey(item: CatalogItem) {
  return (
    legacyKeys[item.id] || (item.label.length <= 30 ? item.label : item.id)
  );
}
const labels = new Map(
  goalCatalog.map((item) => [learningFieldKey(item), item.label]),
);
export function learningFieldLabel(key: string) {
  return labels.get(key) || key;
}
export function searchLearningFields(query: string, kind = "all") {
  const needle = query.normalize("NFKC").toLowerCase().trim();
  return searchGoals(query, kind).sort((a, b) => {
    const rank = (item: CatalogItem) =>
      [item.label, ...item.aliases].some(
        (value) => value.normalize("NFKC").toLowerCase() === needle,
      )
        ? 1
        : 0;
    return rank(b) - rank(a);
  });
}

const fieldKinds = new Map(goalCatalog.map((item) => [learningFieldKey(item), item.kind]));
export function learningFieldKind(key: string) {
  return fieldKinds.get(key) || "unknown";
}
