# IAFS Map Asset Prompts

This file defines reusable prompts for generating separated map overlay assets that match the current IAFS terrain base map style.

The generated assets are intended to be composited on top of `content/maps/terrain/iafs-terrain-base.png` as independent layers. Do not bake these assets into the terrain base image.

## Asset List

This list tracks the separated overlay assets that should be generated for the map system.

### MVP Crash Site Set

| id | asset | usage | footprint | source |
| --- | --- | --- | --- | --- |
| `iafs_crash_wreckage` | Crash wreckage | Main crash-site building/landmark overlay | Large, multi-cell | `iafs_crash_site`, `iafs_shuttle_core` |
| `iafs_scattered_cargo` | Scattered cargo crates | Investigatable supply footprint overlay | Medium, 2x2-ish | `iafs_scattered_supplies` |
| `iafs_field_generator` | Field generator | Repairable power structure overlay | Small, 1 cell | `iafs_generator` |
| `iafs_life_support_unit` | Life support unit | Repairable survival equipment overlay | Small, 1 cell | `iafs_life_support` |
| `iafs_shuttle_core` | Shuttle core | Critical wreck component overlay | Small/medium, 1 cell | `iafs_shuttle_core` |
| `iafs_southern_approach_marker` | Southern approach debris/path marker | Route/approach visual marker | Medium, 2-4 cells | `iafs_southern_approach` |

### Survival Utility Expansion

| id | asset | usage | footprint | source |
| --- | --- | --- | --- | --- |
| `emergency_shelter` | Emergency shelter | Player-built or repaired camp structure | Medium, 1-2 cells | survival loop |
| `communications_antenna` | Communications antenna | Signal upgrade / call event structure | Medium, 1 cell | communication loop |
| `survey_beacon` | Survey beacon | Map reveal / scouting marker | Small, 1 cell | map system |
| `resource_extractor` | Resource extractor | Resource node building overlay | Medium, 1 cell | resource loop |
| `storage_cache` | Storage cache | Supply stash / inventory location | Small, 1 cell | inventory loop |
| `portable_power_relay` | Portable power relay | Energy route / repair support object | Small, 1 cell | power loop |

### IAFS Story Location Set

| id | asset | usage | footprint | source |
| --- | --- | --- | --- | --- |
| `scavenger_camp_ashfrost` | Ashfrost scavenger camp | Side story camp overlay | Medium/large | `loc_scavenger_camp_ashfrost` |
| `frostbay_settlement_bunker` | Frostbay settlement bunker | Cold-side settlement landmark | Large | `loc_frostbay_settlement` |
| `ice_shell_workshop` | Ice shell workshop | Cold-side workshop building | Medium | `loc_ice_shell_workshop` |
| `stilltide_depot` | Stilltide depot | Cold-side logistics/storage building | Medium | `loc_stilltide_depot` |
| `windbarrier_tower` | Windbarrier tower | Cold-side tower/marker | Small/medium | `loc_windbarrier_towers` |
| `cinderforge_stronghold` | Cinderforge stronghold | Hot-side settlement landmark | Large | `loc_cinderforge_settlement` |
| `red_anvil_works` | Red anvil works | Hot-side forge/workshop | Medium | `loc_red_anvil_works` |
| `ashbridge_station` | Ashbridge station | Hot-side travel/logistics point | Medium | `loc_ashbridge_station` |
| `meltwell_corridor` | Meltwell corridor structure | Hot-side mine/corridor marker | Medium | `loc_meltwell_corridor` |

### Gate Realm And Hazard Set

| id | asset | usage | footprint | source |
| --- | --- | --- | --- | --- |
| `gate_outer_perimeter` | Gate outer perimeter fragment | Gate region boundary overlay | Large/region | `loc_gate_outer_perimeter` |
| `gate_transition_band` | Gate transition band node | Rhythm/translation zone marker | Medium/large | `loc_gate_transition_band` |
| `gate_control_nexus` | Gate control nexus | Endgame control landmark | Medium | `loc_gate_control_nexus` |
| `gate_phase_chamber` | Gate phase chamber | Endgame calibration landmark | Medium | `loc_gate_phase_chamber` |
| `spore_quarantine_zone` | Spore quarantine marker | Hazard area overlay | Region/medium | `loc_spore_quarantine` |
| `blind_zone_sensor_ruin` | Blind-zone sensor ruin | Sensor/radio hazard landmark | Medium | `loc_blind_zone`, side story |
| `abandoned_fairy_node` | Abandoned node ruin | Alien ruin / abandoned nest overlay | Medium | `loc_abandoned_fairy_node` |

### Map Icon Set

| id | asset | usage | footprint | source |
| --- | --- | --- | --- | --- |
| `icon_crew_position` | Crew position marker | Crew layer marker | Icon 64x64 | crew layer |
| `icon_investigation` | Investigation marker | Investigatable feature marker | Icon 64x64 | functional layer |
| `icon_blocked_route` | Blocked route marker | Blocked/unsafe tile marker | Icon 64x64 | debug/functional layer |
| `icon_emergency_call` | Emergency call marker | Incoming runtime call marker | Icon 64x64 | communication/event layer |
| `icon_resource_node` | Resource node marker | Gather/extract marker | Icon 64x64 | resource layer |
| `icon_repair_required` | Repair required marker | Repairable object marker | Icon 64x64 | repair loop |
| `icon_known_signal` | Known signal marker | Known but unresolved point | Icon 64x64 | map system |
| `icon_unknown_signal` | Unknown signal marker | Hidden/unrevealed point | Icon 64x64 | map system |

### Generation Priority

1. `iafs_crash_wreckage`
2. `iafs_scattered_cargo`
3. `iafs_field_generator`
4. `iafs_life_support_unit`
5. `iafs_shuttle_core`
6. `icon_crew_position`
7. `icon_investigation`
8. `icon_repair_required`
9. `communications_antenna`
10. `survey_beacon`

## Shared Style Contract

Use this shared style block for all map overlay assets:

```text
Low-resolution in-game map overlay asset for an alien survival console map, matching a damaged long-range transmission style. Limited tri-tone palette: deep black-green shadow, dirty ochre yellow highlight, muted olive midtone. CRT scanline texture, faint signal noise, slight color degradation, archival space mission telemetry feel. Practical-effects used-future sci-fi, worn physical props, chunky silhouettes, dirty white and ochre surfaces translated into the limited palette. Top-down orthographic map view with a very slight satellite-camera angle, readable at small size, no dramatic perspective. Centered asset, transparent background, no terrain base, no UI, no text, no logos. Stylized sci-fi survival game map asset, not photorealistic advertising.
```

## Shared Negative Prompt

Use this negative block for all assets:

```text
Avoid: fantasy elements, monsters, famous franchise designs, readable text, logos, UI overlays, clean futuristic glass, glossy advertising render, full-color illustration, photoreal product shot, dramatic cinematic background, Earth landscape, crowds, laser battles, anime character styling, oversized perspective distortion, soft watercolor, high saturation, more than three dominant colors, baked map grid, baked terrain, baked shadow that covers a full tile.
```

## Export Rules

- Target format: transparent PNG.
- Recommended source size: `256x256` for large buildings, `128x128` for small structures, `64x64` for icons.
- Keep every asset centered with 8-12% empty padding around the silhouette.
- Do not include labels or UI indicators inside the asset.
- Prefer crisp silhouettes and readable top-down shapes over detail density.
- Contact shadows should be short and subtle. If possible, export shadow as a separate layer.
- If an asset spans multiple map cells, keep the object footprint obvious from the top-down silhouette.

## Master Building Prompt

Use this as the base for generic building assets:

```text
{shared_style}

Subject: {building_name}, a compact used-future survival structure on an alien frontier map. The object is seen from a top-down orthographic map angle, with a clear chunky silhouette and believable physical construction. Worn panels, reinforced seams, exposed service modules, scuffed hull plates, dust-stained surfaces, practical sci-fi hardware. Designed to read clearly as a map overlay asset at small size. Transparent background. No text, no logos.

{shared_negative}
```

Replace `{building_name}` with one of the concrete subjects below.

## Core Crash Site Assets

### Crash Wreckage

```text
{shared_style}

Subject: broken remains of a small exploration shuttle crash wreck, split hull, scorched panels, fractured cockpit shell, torn cargo bay, bent outer plating, debris clustered into a readable top-down silhouette. The wreck should feel like the same craft from the terrain event art, but simplified as a separate map overlay asset. Transparent background. No text, no logos.

{shared_negative}
```

### Scattered Cargo Crates

```text
{shared_style}

Subject: scattered survival cargo crates and supply boxes, some cracked open, some half-buried, arranged as a compact top-down map asset. Chunky rectangular silhouettes, worn metal edges, dirty ochre highlights, black-green shadow gaps. Transparent background. No text, no logos.

{shared_negative}
```

### Emergency Shelter

```text
{shared_style}

Subject: improvised emergency shelter module made from shuttle panels, folded insulation sheets, anchor struts, low dome canopy, survival tarp geometry translated into hard sci-fi props. Compact readable top-down silhouette for a map overlay. Transparent background. No text, no logos.

{shared_negative}
```

## Utility Buildings

### Field Generator

```text
{shared_style}

Subject: damaged field generator unit, squat industrial sci-fi machine, circular core housing, radiator fins, cable sockets, protective frame, service panels. Readable as a repairable power structure from top-down map view. Transparent background. No text, no logos.

{shared_negative}
```

### Communications Antenna

```text
{shared_style}

Subject: portable communications antenna array, collapsed tripod base, dish segment, mast, signal fins, cable reels, rugged frontier equipment. Top-down orthographic map asset with a clear radial silhouette. Transparent background. No text, no logos.

{shared_negative}
```

### Survey Beacon

```text
{shared_style}

Subject: small survey beacon, low cylindrical base, three stabilizer legs, narrow sensor mast, rugged protective cage, signal hardware. Compact icon-like top-down map asset. Transparent background. No text, no logos.

{shared_negative}
```

### Resource Extractor

```text
{shared_style}

Subject: temporary resource extractor rig, compact drill platform, brace legs, small hopper, exposed pipes, worn industrial panels. Chunky readable silhouette for map overlay, top-down orthographic. Transparent background. No text, no logos.

{shared_negative}
```

## Alien Settlement Assets

### Ashland Trading Post

```text
{shared_style}

Subject: alien frontier trading post built from salvaged metal and heat-stained ceramic plates, low clustered stalls, armored awnings, small storage pods. It should feel used and physical, not fantasy. Top-down readable map asset. Transparent background. No text, no logos.

{shared_negative}
```

### Firewell Station

```text
{shared_style}

Subject: alien firewell station, circular industrial wellhead, heat vents, protective ring, heavy service arms, scorched ochre surfaces, deep black-green recesses. Top-down orthographic map asset, clear circular footprint. Transparent background. No text, no logos.

{shared_negative}
```

### Frozen Settlement Bunker

```text
{shared_style}

Subject: low frozen settlement bunker, angular insulated shell, sealed entry notch, external tanks, weathered armor plates, cold survival architecture translated into the same ochre and olive limited palette. Top-down map overlay asset. Transparent background. No text, no logos.

{shared_negative}
```

## Landmark And Hazard Assets

### Ancient Gate Fragment

```text
{shared_style}

Subject: ancient alien gate fragment, broken ring segment, heavy stone-metal construction, worn edges, embedded mechanical ribs, mysterious but not magical. Top-down orthographic map asset with a strong partial-circle silhouette. Transparent background. No text, no logos.

{shared_negative}
```

### Quarantine Spore Zone Marker

```text
{shared_style}

Subject: quarantine spore hazard marker asset, cluster of low containment stakes, warning pylons without text, irregular dark organic patches, restrained sci-fi hazard shape. Must remain map-readable and limited to the same three-color transmission palette. Transparent background. No text, no logos.

{shared_negative}
```

### Blind-Zone Sensor Ruin

```text
{shared_style}

Subject: damaged sensor ruin in a radio blind zone, broken antenna ribs, collapsed dish panels, buried signal mast, static-corrupted silhouette. Top-down map overlay asset, readable at small size. Transparent background. No text, no logos.

{shared_negative}
```

## Icon Asset Prompts

Use these for small UI/map markers. Keep them symbolic, not decorative.

### Crew Position Marker

```text
{shared_style}

Subject: small crew position marker icon, helmet-dot silhouette with one short direction notch, practical telemetry marker style, no letters, no numbers. Transparent background. 64x64.

{shared_negative}
```

### Investigation Marker

```text
{shared_style}

Subject: investigation marker icon, compact sensor reticle surrounding a small fractured object shape, no letters, no numbers, readable on noisy terrain. Transparent background. 64x64.

{shared_negative}
```

### Blocked Route Marker

```text
{shared_style}

Subject: blocked route marker icon, compact broken barrier silhouette with two crossed structural beams, no letters, no numbers, readable on terrain. Transparent background. 64x64.

{shared_negative}
```

### Emergency Call Marker

```text
{shared_style}

Subject: emergency call marker icon, small pulsing signal node shape, concentric broken transmission arcs, no letters, no numbers, restrained sci-fi telemetry style. Transparent background. 64x64.

{shared_negative}
```

## Batch Prompt Template

Use this when generating multiple matching assets in one batch:

```text
Generate a consistent set of separated transparent PNG map overlay assets for the same game and planet. All assets must share identical camera angle, tri-tone palette, CRT scanline/noise treatment, outline weight, lighting direction, and scale language.

Shared style:
{shared_style}

Asset list:
1. {asset_name_1}: {short_subject_description_1}
2. {asset_name_2}: {short_subject_description_2}
3. {asset_name_3}: {short_subject_description_3}

Each asset should be centered individually, isolated on transparent background, no terrain base, no labels, no logos.

{shared_negative}
```

## Quick Quality Checklist

- Does it still read clearly when scaled down to map size?
- Does it use the same yellow-green damaged transmission palette as the terrain map?
- Is the background transparent and free of baked terrain?
- Is the camera angle consistent with the map base?
- Can the object footprint be aligned to one or more grid cells?
- Are there no readable letters, logos, UI panels, or franchise-like shapes?
