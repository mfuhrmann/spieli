# Supported Equipment Types

This page documents every equipment type that spieli recognises. The definitions live in two source files:

- `app/src/lib/objPlaygroundEquipment.js` — `objDevices`, `objFitnessStation`, `objFeatures`
- `app/src/lib/equipmentAttributes.js` — `pitchImages`

These tables decide a feature's symbol, label and example image. An OSM value not listed here still shows, with a generic symbol, the tag value tidied up as its label (`baby_swing` → "Baby swing"), and no image. Which tags make a playground match a filter or count for mapping detail: [OSM Tags spieli Reads](osm-tags.md).

---

## Playground devices (`objDevices`)

Keyed by the OSM `playground=*` tag value. 85 entries, grouped by `category`, which decides the device's symbol in the equipment list and on the map. Labels come from `equipment.devices.<key>` in the locale files (English and German shown here); the `name_de` field in `objDevices` is only the last fallback. "Image" marks entries with an example illustration.

Some keys cover mappers who use a generic value instead of a specific one (`balance`, `climbing`, `rotator`, `water`, `sand`); they are listed under their category.

To add a device: [Add a Playground Device](../contributing/add-device.md).

### Stationary

| Key | English | German | Image |
|---|---|---|---|
| `slide` | Slide | Rutsche | ✓ |
| `seesaw` | Seesaw | Wippe | ✓ |
| `springy` | Spring rider | Federwipptier | ✓ |

### Structure parts

| Key | English | German | Image |
|---|---|---|---|
| `structure` | Play structure | Spielstruktur | ✓ |
| `bridge` | Bridge | Brücke | ✓ |
| `wobble_bridge` | Rope bridge | Hängebrücke | ✓ |
| `platform` | Platform | Plattform | ✓ |
| `steps` | Steps | Treppe | ✓ |
| `ladder` | Ladder | Leiter | ✓ |

### Swings

| Key | English | German | Image |
|---|---|---|---|
| `swing` | Swing | Schaukel | ✓ |
| `baby_swing` | Baby swing | Babyschaukel | ✓ |
| `basketswing` | Basket swing | Korbschaukel | ✓ |
| `tire_swing` | Tyre swing | Reifenschaukel | ✓ |
| `rope_swing` | Rope swing | Tampenschaukel | ✓ |

### Balance

| Key | English | German | Image |
|---|---|---|---|
| `agility_trail` | Agility trail | Bewegungsparcours | ✓ |
| `balancebeam` | Balance beam | Balancierbalken | ✓ |
| `rope_traverse` | Balance rope | Balancierseil | ✓ |
| `stepping_stone` | Stepping stones | Trittsteine | ✓ |
| `stepping_post` | Stepping posts | Trittpfosten | ✓ |
| `balance` | Balance equipment | Balanciergerät |  |

### Climbing

| Key | English | German | Image |
|---|---|---|---|
| `climbingframe` | Climbing frame | Klettergerüst | ✓ |
| `climbingwall` | Climbing wall | Kletterwand | ✓ |
| `climbing_slope` | Climbing ramp | Kletterrampe | ✓ |
| `climbing_pole` | Climbing pole | Kletterstange | ✓ |
| `monkey_bars` | Monkey bars | Hangelstrecke | ✓ |
| `climbing` | Climbing equipment | Klettergerät |  |

### Rotating

| Key | English | German | Image |
|---|---|---|---|
| `roundabout` | Merry-go-round | Karussell | ✓ |
| `basketrotator` | Basket rotator | Korbkarusell | ✓ |
| `aerialrotator` | Aerial rotator | Hängedrehkreisel | ✓ |
| `spinner` | Spinner | Drehbrett | ✓ |
| `spinning_disc` | Spinning disc | Drehscheibe | ✓ |
| `spinning_circle` | Spinning ring | Drehring | ✓ |
| `spinner_bowl` | Spinner bowl | Drehschale | ✓ |
| `rotator` | Rotator | Rotationsgerät |  |

### Sand

| Key | English | German | Image |
|---|---|---|---|
| `sandpit` | Sandpit | Sandkasten | ✓ |
| `chute` | Sand chute | Sandrohr | ✓ |
| `sieve` | Sand sieve | Sieb | ✓ |
| `sand_wheel` | Sand wheel | Sandrad | ✓ |
| `sand_seesaw` | Sand seesaw | Sandwippe | ✓ |
| `sand_pulley` | Sand pulley | Sandaufzug | ✓ |
| `excavator` | Sand excavator | Spielbagger | ✓ |
| `table` | Play table | Spieltisch | ✓ |
| `sand` | Sand play | Sandspielelement |  |

### Water

| Key | English | German | Image |
|---|---|---|---|
| `splash_pad` | Splash pad | Wasserspritzanlage | ✓ |
| `pump` | Water pump | Wasserpumpe | ✓ |
| `water_channel` | Water channel | Wasserkanal | ✓ |
| `water_stream` | Water stream | Wasserlauf | ✓ |
| `water_seesaw` | Water seesaw | Wasserwippe | ✓ |
| `water_basin` | Water basin | Wasserbecken | ✓ |
| `water_barrier` | Water barrier | Wasserbarriere | ✓ |
| `archimedes_screw` | Archimedes screw | Wasserschraube | ✓ |
| `water_wheel` | Water wheel | Wasserrad | ✓ |
| `water_cannon` | Water cannon | Wasserkanone | ✓ |
| `water_sprayer` | Water sprayer | Wasserdüse | ✓ |
| `water` | Water play | Wasserspiele |  |

### Activity

| Key | English | German | Image |
|---|---|---|---|
| `horizontal_bar` | Horizontal bar | Reckstange | ✓ |
| `parallel_bars` | Parallel bars | Barren | ✓ |
| `bannister_bars` | Pole slide | Stangenrutsche | ✓ |
| `hamster_wheel` | Hamster wheel | Hamsterrolle | ✓ |
| `exercise` | Exercise station | Fitnessgerät | ✓ |

### Motion

| Key | English | German | Image |
|---|---|---|---|
| `zipwire` | Zip wire | Seilbahn | ✓ |
| `trampoline` | Trampoline | Trampolin | ✓ |
| `cushion` | Jumping cushion | Hüpfkissen | ✓ |
| `belt_bridge` | Belt bridge | Hüpfbandbrücke | ✓ |
| `spring_board` | Spring board | Wackelbrett | ✓ |
| `hopscotch` | Hopscotch | Hüpfspiel | ✓ |
| `track` | Race track | Rennstrecke | ✓ |
| `sledding` | Sledding hill | Rodelstrecke | ✓ |

### Topographical

| Key | English | German | Image |
|---|---|---|---|
| `mound` | Play mound | Spielhügel | ✓ |
| `dome` | Dome | Halbkugel | ✓ |

### Other

| Key | English | German | Image |
|---|---|---|---|
| `activitypanel` | Activity panel | Spielwand | ✓ |
| `playhouse` | Playhouse | Spielhaus | ✓ |
| `teenshelter` | Teen shelter | Unterstand | ✓ |
| `tunnel_tube` | Tunnel tube | Kriechtunnel | ✓ |
| `speaking_tube` | Speaking tube | Sprechrohr | ✓ |
| `funnel_ball` | Funnel ball | Trichterball | ✓ |
| `ball_pool` | Ball pool | Bällebad | ✓ |
| `ride_on` | Ride-on animal | Sitztier | ✓ |
| `marble_run` | Marble run | Murmelspiel | ✓ |
| `map` | Map | Landkarte | ✓ |
| `blackboard` | Blackboard | Tafel | ✓ |
| `musical_instrument` | Musical instrument | Musikinstrument | ✓ |
| `seat` | Seat | Sitz | ✓ |
| `hammock` | Hammock | Hängematte | ✓ |
| `youth_bench` | Youth bench | Jugendbank | ✓ |

---

## Fitness stations (`objFitnessStation`)

Keyed by the OSM `fitness_station=*` tag value. 21 entries; labels from `equipment.fitness.<key>`, no example images.

| Key | English | German |
|---|---|---|
| `horizontal_bar` | Pull-up bar | Klimmzugstange |
| `parallel_bars` | Parallel bars | Barren |
| `push_up` | Push-up station | Liegestützgerät |
| `sit_up` | Sit-up station | Bauchtrainer |
| `balance_beam` | Balance beam | Balancierbalken |
| `elliptical_trainer` | Elliptical trainer | Crosstrainer |
| `exercise_stairs` | Exercise stairs | Treppenstufen |
| `rowing` | Rowing machine | Rudergerät |
| `bicycle` | Exercise bike | Radergometer |
| `sign` | Information sign | Informationsschild |
| `stepping_stone` | Stepping stones | Trittsteine |
| `training_wall` | Training wall | Trainingswall |
| `wall_bars` | Wall bars | Sprossenwand |
| `dip` | Dip station | Dip-Station |
| `slalom_bars` | Slalom bars | Slalomstangen |
| `stretching` | Stretching station | Streckgerät |
| `air_walker` | Air walker | Luftläufer |
| `chest_press` | Chest press | Brustpresse |
| `leg_press` | Leg press | Beinpresse |
| `rotary_torso` | Rotary torso | Rumpfrotation |
| `archery` | Archery target | Bogenschießen |

---

## Non-device features (`objFeatures`)

These entries cover amenities and natural features that appear inside playground boundaries but are not `playground=*` devices. 15 entries. Each entry matches on a set of OSM tags; **more-specific entries must appear before more-general ones** so the matcher picks the right icon.

| Key | OSM tags | Label | Icon | Size |
|---|---|---|---|---|
| `artwork` | `tourism=artwork` | Kunstwerk | artwork | 12 |
| `bicycle_parking` | `amenity=bicycle_parking` | Fahrradständer | bicycle_parking | 16 |
| `bench_backrest` | `amenity=bench` + `backrest=yes` | Sitzbank | bench_backrest_yes | 12 |
| `bench` | `amenity=bench` | Sitzbank | bench_backrest_no | 12 |
| `gate` | `barrier=gate` | Eingangstor | gate | 12 |
| `shelter` | `amenity=shelter` | Unterstand | shelter | 12 |
| `picnic_table` | `leisure=picnic_table` | Picknicktisch | picnic_table | 12 |
| `table_tennis` | `leisure=pitch` + `sport=table_tennis` | Tischtennisplatte | table_tennis | 12 |
| `soccer` | `leisure=pitch` + `sport=soccer` | Bolzplatz | soccer | 12 |
| `basketball` | `leisure=pitch` + `sport=basketball` | Basketballfeld | basketball | 12 |
| `pitch` | `leisure=pitch` | Sportfeld | pitch | 20 |
| `shrub` | `natural=shrub` | Busch | shrub | 12 |
| `tree_evergreen` | `natural=tree` + `leaf_type=needleleaved` | Baum | tree_needleleaved | 12 |
| `tree` | `natural=tree` | Baum | tree_broadleaved | 12 |
| `waste_basket` | `amenity=waste_basket` | Abfallbehälter | waste_basket | 10 |

The `size` field controls the rendered icon size in pixels on the map.

---

## Sport pitch images (`pitchImages`)

Keyed by the OSM `sport=*` tag value on a `leisure=pitch` feature. Provides an example diagram or photo shown in the equipment detail panel. 15 entries; a pitch with several sports (`soccer;basketball`) gets the `multi` image. The file names are resolved at build time (`make equipment-images`).

| Key | Image (Wikimedia Commons) |
|---|---|
| `soccer` | `File:Football pitch metric.svg` |
| `basketball` | `File:Basketball court fiba.svg` |
| `table_tennis` | `File:Table Tennis Table Blue.svg` |
| `volleyball` | `File:VolleyballCourt.svg` |
| `tennis` | `File:Tennis court metric.svg` |
| `handball` | `File:Handball Field diagram -en.svg` |
| `badminton` | `File:Badminton court.svg` |
| `boules` | `File:Haute-Avesnes - Terrain de pétanque du stade.jpg` |
| `petanque` | `File:Haute-Avesnes - Terrain de pétanque du stade.jpg` |
| `multi` | `File:Great Central Road Multi-use Games Area, Loughborough.jpg` |
| `skateboard` | `File:Solvang Skatepark.jpg` |
| `bmx` | `File:BMX Pump Track, Whitley Bay, UK.jpg` |
| `athletics` | `File:Athletics track.jpg` |
| `beachvolleyball` | `File:Beach volleyball court in Kaukajärvi, Tampere, Finland.jpg` |
| `climbing` | `File:Urduliz outdoor climbing wall.jpg` |

---

## Fallback behaviour

An OSM tag not present in these objects still renders on the map and in the equipment list, but with reduced information:

- Map icon: the generic fallback symbol
- Label: the tag value tidied up (underscores to spaces, first letter capitalised), unless a locale file has a translation for it
- Example image: none

To add proper support for an unlisted type, follow [Add a Playground Device](../contributing/add-device.md) or [Add a Sport Pitch Type](../contributing/add-sport-type.md).
