"use strict";

(function () {
  const originals = globalThis.NiuStages;
  const valleys = globalThis.NiuExpedition.regions;
  const highlands = globalThis.NiuHighlands;
  globalThis.NiuStages = originals.flatMap((original, chapterIndex) => {
    const extras = valleys[original.id] ?? highlands[original.id] ?? [];
    const acts = original.goal.finale ? [...extras, original] : [original, ...extras];
    return acts.map((level, index) => ({
      ...level,
      chapter: original.id,
      chapterIndex,
      act: index + 1,
      actCount: acts.length,
      chapterFinal: index === acts.length - 1,
    }));
  });
})();
