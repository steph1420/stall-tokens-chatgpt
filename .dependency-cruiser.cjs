// Copied from steph1420/agent-common checks/ at commit 88c9672. Do not edit here; change agent-common and copy again.
// One local change (Pos, 16 Nov audit): not-to-unresolvable skips `virtual:pwa-register`, a Vite PWA build-time module
// that dependency-cruiser cannot resolve on disk. To be offered upstream to agent-common checks/ (see docs/STATUS.md).
// agent-common/checks: shared dependency-cruiser rules (06 rules 1, 2, 4, 11; templates/ARCHITECTURE.md §2).
// Apps copy this to the repo root as .dependency-cruiser.cjs.
// Layout: src/{config,tokens,contract,data,store,motion,ui,mock}. Flow: ui -> store -> data (adapters).
/** @type {import('dependency-cruiser').IConfiguration} */
const TEST = ['\\.test\\.tsx?$', '^src/test/'];
const NET_STORAGE = 'node_modules/(axios|ky|idb|idb-keyval|localforage|dexie|firebase|@supabase|googleapis)/';
const layer = (name, from, notTo, comment) => ({ name, severity: 'error', comment, from: { path: from, pathNot: TEST }, to: { path: notTo } });

module.exports = {
  forbidden: [
    layer('config-tokens-import-nothing', '^src/(config|tokens)/', ['^src/(contract|data|store|motion|ui|mock)/'],
      'config/ and tokens/ are importable by all and import nothing.'),
    layer('contract-only-config-tokens', '^src/contract/', ['^src/(data|store|motion|ui|mock)/'],
      'contract/ may import only config/ and tokens/.'),
    layer('data-not-up', '^src/data/', ['^src/(store|motion|ui|mock)/'],
      'data/ (adapters) never imports store/, motion/, ui/ or mock/.'),
    layer('store-not-to-ui', '^src/store/', ['^src/(motion|ui|mock)/', NET_STORAGE],
      'store/ is the single state owner; it calls data/ adapters, never ui/, motion/, network or storage libraries.'),
    layer('motion-not-to-state', '^src/motion/', ['^src/(data|store|ui|mock)/', NET_STORAGE],
      'motion/ may import contract/, config/, tokens/ and framer-motion only.'),
    { ...layer('only-store-calls-data', '^src/', ['^src/data/'], 'Only the store may call the data layer (06 rule 1).'),
      from: { path: '^src/', pathNot: [...TEST, '^src/(store|data|mock)/'] } },
    layer('ui-not-to-network-storage', '^src/ui/', [NET_STORAGE],
      'UI never touches network or storage (06 rule 1).'),
    { ...layer('no-mock-in-production', '^src/', ['^src/mock/'], 'Demo data and fixtures live in mock/ and are used by tests only (06 rule 11).'),
      from: { path: '^src/', pathNot: [...TEST, '^src/mock/'] } },
    { ...layer('framer-motion-only-in-motion', '^src/', ['node_modules/framer-motion/'], 'Only motion/ imports framer-motion; screens ask motion/ for movement (06 rules 2, 3).'),
      from: { path: '^src/', pathNot: [...TEST, '^src/motion/'] } },
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    { name: 'not-to-unresolvable', severity: 'error', from: {}, to: { couldNotResolve: true, pathNot: '^virtual:pwa-register' } },
    { name: 'no-dev-deps-in-production', severity: 'error', comment: 'Production code may not import devDependencies.',
      from: { path: '^src/', pathNot: [...TEST, '^src/mock/'] }, to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] } },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default', 'types'] },
    exclude: { path: '\\.css$' },
  },
};
