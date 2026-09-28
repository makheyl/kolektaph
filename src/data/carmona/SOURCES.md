# Carmona data sources

| File             | Contents                                                                             | Source                                                                                                | Status                                                                               |
| ---------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `barangays.json` | 14 barangay boundaries (simplified to about 3 m), names, alternate names, population | © OpenStreetMap contributors (ODbL 1.0). The population tags match the PSA 2024 Census of Population. | Real data, but **approximate**: confirm the boundaries with the City Planning Office |
| `routes.json`    | 6 collection routes starting at Carmona City Hall, split into named street segments  | OSRM routing on OpenStreetMap roads, through named residential streets sampled in each barangay       | **SAMPLE**, not ENRO routes                                                          |
| `meta.json`      | City bounds, centre, depot, provenance                                               | Derived from the above                                                                                | Generated                                                                            |
| `index.ts`       | Trucks and route schedules                                                           | Written by hand for the prototype                                                                     | **SAMPLE**                                                                           |

Regenerate with:

```bash
node scripts/data/build-carmona-data.mjs
```

The app must display "© OpenStreetMap contributors" wherever these maps are shown (the map's attribution control does this).
