// =============================================================================
// objPlaygroundEquipment.js
// =============================================================================
//
// This file is the single source of truth for all playground device types and
// playground features that the app knows about. If a device or feature isn't
// listed here, the app won't know how to display or label it.
//
// It exports two objects:
//
//   objDevices   — individual playground devices (swings, slides, climbing
//                  frames, …). Each key is an OSM `playground=*` tag value.
//
//   objFeatures  — other characteristics of a playground (benches, fences,
//                  toilets, …) that are not individual devices but are tagged
//                  differently in OSM. Each key is an arbitrary identifier.
//
// -----------------------------------------------------------------------------
// HOW TO ADD A NEW DEVICE — quick reference
// -----------------------------------------------------------------------------
//
// 1. Find the correct OSM tag at:
//    https://wiki.openstreetmap.org/wiki/Key:playground
//
// 2. Add a new key to objDevices using the OSM tag value as the key name:
//
//    mydevice: {
//        name_de:     "German name",        // REQUIRED — fallback if locale key is absent
//        image:       "File:Example.jpg",   // OPTIONAL — Wikimedia Commons filename
//        category:    "stationary",         // OPTIONAL — groups the device in filters
//        filterable:  true,                 // OPTIONAL — show in sidebar filter?
//        filter_attr: ["length", "height"], // OPTIONAL — OSM sub-attributes to filter by
//        activity:    "climb",              // REQUIRED — activity row, or null
//        highlight:   false,                // REQUIRED — worth a detour?
//    },
//
// Field details:
//
//   name_de      (string, required)
//                Fallback label used when the svelte-i18n key
//                `equipment.devices.<key>` is missing for the active locale.
//                Primary display names come from locales/ — add a matching
//                key there when adding a new device.
//
//   image        (string, optional)
//                A Wikimedia Commons filename in the format "File:Example.jpg".
//                The app tries Commons first; if the image is not found there,
//                it falls back to the OSM wiki. If the field is omitted entirely,
//                no example image is shown — no broken icon appears.
//                To find a good filename: search commons.wikimedia.org, open the
//                image page, and copy the "File:" name from the page title.
//
//   category     (string, optional)
//                Groups the device under a heading in the filter panel.
//                Known values: "stationary", "structure_parts", "active".
//                Omit if the device doesn't belong to a filter group.
//
//   filterable   (boolean, optional)
//                When true, this device type appears as a checkbox in the
//                sidebar filter so users can show/hide playgrounds that have it.
//                Defaults to false when omitted.
//
//   filter_attr  (array of strings, optional)
//                OSM sub-attributes of this device to expose as filter controls
//                (e.g. ["length", "height"] for a slide). Only meaningful when
//                filterable is true. Omit for devices with no useful numeric
//                attributes.
//
//   activity     (string | null, REQUIRED)
//                What a child does on the device, shown as the activity row in
//                the detail panel (lib/activities.js). One of ACTIVITIES there:
//                swing, slide, rock, climb, balance, spin, bounce, exercise,
//                dig, explore. `null` for structure parts, water devices (they
//                are one "water play" highlight instead) and one-off items.
//                Deliberately not derived from `category`, which groups the
//                filter panel and puts slide and seesaw together.
//
//   highlight    (boolean, REQUIRED)
//                A device that makes a playground worth a detour (zip line,
//                trampoline, marble run, …). Named in the panel's highlights
//                line. Water devices are covered by their category instead.
//
//   activities.test.js fails when a device lacks either field.
//
// -----------------------------------------------------------------------------

export const objDevices = {
    slide: {
        name_de: "Rutsche",
        image: "File:Playground Slide Metal.jpg",
        category: "stationary",
        filterable: true,
        filter_attr: ["length", "height"],
        activity: "slide",
        highlight: false,
    },
    seesaw: {
        name_de: "Wippe",
        image: "File:Seesaw-aa.jpg",
        category: "stationary",
        filterable: true,
        activity: "rock",
        highlight: false,
    },
    springy: {
        name_de: "Federwipptier",
        image: "File:Playground springs in Obermenzing 02.jpg",
        category: "stationary",
        activity: "rock",
        highlight: false,
    },
    structure: {
        name_de: "Spielstruktur",
        image: "File:SunwardCohousingPlayStructure2005.jpg",
        category: "structure_parts",
        activity: null,
        highlight: false,
    },
    bridge: {
        name_de: "Brücke",
        image: "File:Playground in Muchall Park, Wolverhampton - geograph.org.uk - 2735437.jpg",
        category: "structure_parts",
        activity: null,
        highlight: false,
    },
    wobble_bridge: {
        name_de: "Hängebrücke",
        image: "File:Playground ropebridge Trusepark Berlin Neukölln.jpg",
        category: "structure_parts",
        filterable: true,
        filter_attr: ["length"],
        activity: "balance",
        highlight: false,
    },
    platform: {
        name_de: "Plattform",
        image: "File:Playground structure wood toddler.jpg",
        category: "structure_parts",
        activity: null,
        highlight: false,
    },
    steps: {
        name_de: "Treppe",
        image: "File:Playground steps wood step count 7 handrail.jpg",
        category: "structure_parts",
        activity: null,
        highlight: false,
    },
    ladder: {
        name_de: "Leiter",
        image: "File:Playground ladder.jpg",
        category: "structure_parts",
        activity: null,
        highlight: false,
    },
    swing: {
        name_de: "Schaukel",
        image: "File:Accessibleplay-Swing.jpg",
        category: "swing",
        activity: "swing",
        highlight: false,
    },
    baby_swing: {
        name_de: "Babyschaukel",
        image: "File:Baby-swings-2.jpg",
        category: "swing",
        activity: "swing",
        highlight: false,
    },
    basketswing: {
        name_de: "Korbschaukel",
        image: "File:Playground swing 03.jpg",
        category: "swing",
        filterable: true,
        activity: "swing",
        highlight: false,
    },
    tire_swing: {
        name_de: "Reifenschaukel",
        image: "File:Tire swing, near Litchfield, Connecticut LCCN2012630791 (cropped).jpg",
        category: "swing",
        activity: "swing",
        highlight: false,
    },
    rope_swing: {
        name_de: "Tampenschaukel",
        image: "File:Playground rope swing Zoologischer Garten Berlin.jpg",
        category: "swing",
        activity: "swing",
        highlight: false,
    },
    agility_trail: {
        name_de: "Bewegungsparcours",
        image: "File:Agility_trail_for_kids.jpeg",
        category: "balance",
        activity: "balance",
        highlight: false,
    },
    balancebeam: {
        name_de: "Balancierbalken",
        image: "File:Playground Balance beam.jpg",
        category: "balance",
        activity: "balance",
        highlight: false,
    },
    rope_traverse: {
        name_de: "Balancierseil",
        image: "File:Playground balance rope handrail.jpg",
        category: "balance",
        activity: "balance",
        highlight: false,
    },
    stepping_stone: {
        name_de: "Trittsteine",
        image: "File:Marine Park td (2019-05-24) 062 - Lenape Playground.jpg",
        category: "balance",
        activity: "balance",
        highlight: false,
    },
    stepping_post: {
        name_de: "Trittpfosten",
        image: "File:Playground stepping poles Thomashöhe Berlin Neukölln.jpg",
        category: "balance",
        activity: "balance",
        highlight: false,
    },
    climbingframe: {
        name_de: "Klettergerüst",
        image: "File:DeimosXL1.jpg",
        category: "climbing",
        filterable: true,
        filter_attr: ["height"],
        activity: "climb",
        highlight: false,
    },
    climbingwall: {
        name_de: "Kletterwand",
        image: "File:Playground climbingwall.jpg",
        category: "climbing",
        filterable: true,
        filter_attr: ["height"],
        activity: "climb",
        highlight: false,
    },
    climbing_slope: {
        name_de: "Kletterrampe",
        image: "File:Playground rope ladder.jpg",
        category: "climbing",
        activity: "climb",
        highlight: false,
    },
    climbing_pole: {
        name_de: "Kletterstange",
        image: "File:Playground climbing pole height 2.jpg",
        category: "climbing",
        activity: "climb",
        highlight: false,
    },
    monkey_bars: {
        name_de: "Hangelstrecke",
        image: "File:Playground monkey bars, hoops.jpg",
        category: "climbing",
        activity: "climb",
        highlight: false,
    },
    roundabout: {
        name_de: "Karussell",
        image: "File:Manually powered carousel on a playground in Saint-Petersburg.JPG",
        category: "rotating",
        activity: "spin",
        highlight: false,
    },
    basketrotator: {
        name_de: "Korbkarusell",
        image: "File:Playground Basket-Rotator Berlin Germany.jpg",
        category: "rotating",
        activity: "spin",
        highlight: false,
    },
    aerialrotator: {
        name_de: "Hängedrehkreisel",
        image: "File:Hanging roundabout.jpg",
        category: "rotating",
        activity: "spin",
        highlight: true,
    },
    spinner: {
        name_de: "Drehbrett",
        image: "File:Playground equipment spinner Rollbergsiedlung Berlin-Neukölln.jpg",
        category: "rotating",
        activity: "spin",
        highlight: false,
    },
    spinning_disc: {
        name_de: "Drehscheibe",
        image: "File:Playground rotator Thomashöhe Berlin Neukölln.jpg",
        category: "rotating",
        activity: "spin",
        highlight: false,
    },
    spinning_circle: {
        name_de: "Drehring",
        image: "File:Spinning_circle.jpg",
        category: "rotating",
        activity: "spin",
        highlight: false,
    },
    spinner_bowl: {
        name_de: "Drehschale",
        image: "File:Spinner bowl in Springfield park, Guiseley (side view).jpg",
        category: "rotating",
        activity: "spin",
        highlight: false,
    },
    sandpit: {
        name_de: "Sandkasten",
        image: "File:Zandbakw.jpg",
        category: "sand",
        activity: "dig",
        highlight: false,
    },
    chute: {
        name_de: "Sandrohr",
        image: "File:Playground sand chute.jpg",
        category: "sand",
        activity: "dig",
        highlight: false,
    },
    sieve: {
        name_de: "Sieb",
        image: "File:Playground sand sieve.jpg",
        category: "sand",
        activity: "dig",
        highlight: false,
    },
    sand_wheel: {
        name_de: "Sandrad",
        image: "File:Playground sand wheel.jpg",
        category: "sand",
        activity: "dig",
        highlight: false,
    },
    sand_seesaw: {
        name_de: "Sandwippe",
        image: "File:Playground sand seesaw.jpg",
        category: "sand",
        activity: "dig",
        highlight: false,
    },
    sand_pulley: {
        name_de: "Sandaufzug",
        image: "File:Playground sand pulley Lichtenrader Straße Berlin Neukölln.jpg",
        category: "sand",
        activity: "dig",
        highlight: false,
    },
    excavator: {
        name_de: "Spielbagger",
        image: "File:Playground excavator, unpowered.jpg",
        category: "sand",
        filterable: true,
        activity: "dig",
        highlight: false,
    },
    splash_pad: {
        name_de: "Wasserspritzanlage",
        image: "File:Urbeach-high-park-splashpad.jpg",
        category: "water",
        activity: null,
        highlight: false,
    },
    pump: {
        name_de: "Wasserpumpe",
        image: "File:Wasserspielplatz an der Schäferwiese 01.jpg",
        category: "water",
        filterable: true,
        activity: null,
        highlight: false,
    },
    water_channel: {
        name_de: "Wasserkanal",
        image: "File:Playground water channels Schillerpromenade Berlin Neukölln.jpg",
        category: "water",
        activity: null,
        highlight: false,
    },
    water_stream: {
        name_de: "Wasserlauf",
        image: "File:Playground water flow.jpg",
        category: "water",
        activity: null,
        highlight: false,
    },
    water_seesaw: {
        name_de: "Wasserwippe",
        image: "File:Playground water seesaw Thomashöhe Berlin Neukölln.jpg",
        category: "water",
        activity: null,
        highlight: false,
    },
    water_basin: {
        name_de: "Wasserbecken",
        image: "File:Playground water basin with drain and plug.jpg",
        category: "water",
        activity: null,
        highlight: false,
    },
    water_barrier: {
        name_de: "Wasserbarriere",
        image: "File:Playground water barrier Berlin Neukoelln.jpg",
        category: "water",
        activity: null,
        highlight: false,
    },
    archimedes_screw: {
        name_de: "Wasserschraube",
        image: "File:Norden Archimedische Schraube.jpg",
        category: "water",
        activity: null,
        highlight: false,
    },
    water_wheel: {
        name_de: "Wasserrad",
        image: "File:Playground water wheel Ellricher Straße Berlin-Neukölln.jpg",
        category: "water",
        activity: null,
        highlight: false,
    },
    water_cannon: {
        name_de: "Wasserkanone",
        image: "File:Playground water cannon.jpg",
        category: "water",
        activity: null,
        highlight: false,
    },
    water_sprayer: {
        name_de: "Wasserdüse",
        image: "File:Farm Playground td (2018-10-30) 28.jpg",
        category: "water",
        activity: null,
        highlight: false,
    },
    horizontal_bar: {
        name_de: "Reckstange",
        image: "File:Rekstok.JPG",
        category: "activity",
        activity: "exercise",
        highlight: false,
    },
    parallel_bars: {
        name_de: "Barren",
        image: "File:Shun Lee Estate Playground, Gym Zone and Basketball Court.jpg",
        category: "activity",
        activity: "exercise",
        highlight: false,
    },
    bannister_bars: {
        name_de: "Stangenrutsche",
        image: "File:Playground parallel bars Mahlower Straße Berlin Neukölln.jpg",
        category: "activity",
        activity: "exercise",
        highlight: false,
    },
    hamster_wheel: {
        name_de: "Hamsterrolle",
        image: "File:Kaiserslautern Volkspark Hamsterrolle.jpg",
        category: "activity",
        activity: "exercise",
        highlight: true,
    },
    activitypanel: {
        name_de: "Spielwand",
        image: "File:Szwedy - plac zabaw - kółko i krzyżyk.jpg",
        category: "other",
        activity: null,
        highlight: false,
    },
    exercise: {
        name_de: "Fitnessgerät",
        image: "File:Outdoor gym in Parque de Bateria, Torremolinos.JPG",
        category: "activity",
        activity: "exercise",
        highlight: false,
    },
    zipwire: {
        name_de: "Seilbahn",
        image: "File:Ropeway play.jpg",
        category: "motion",
        filterable: true,
        filter_attr: ["length"],
        activity: null,
        highlight: true,
    },
    trampoline: {
        name_de: "Trampolin",
        image: "File:playground_trampoline.jpg",
        category: "motion",
        filterable: true,
        activity: "bounce",
        highlight: true,
    },
    cushion: {
        name_de: "Hüpfkissen",
        image: "File:Hüpfkissen.jpg",
        category: "motion",
        activity: "bounce",
        highlight: false,
    },
    belt_bridge: {
        name_de: "Hüpfbandbrücke",
        image: "File:Playground belt bridge.jpg",
        category: "motion",
        activity: "balance",
        highlight: false,
    },
    spring_board: {
        name_de: "Wackelbrett",
        image: "File:Playground springs in Obermenzing 05.jpg",
        category: "motion",
        activity: "bounce",
        highlight: false,
    },
    playhouse: {
        name_de: "Spielhaus",
        image: "File:Playhouse.jpg",
        category: "other",
        activity: "explore",
        highlight: false,
    },
    teenshelter: {
        name_de: "Unterstand",
        image: "File:Teen shelter near former coastguard lookout, Watchet - geograph.org.uk - 1714960.jpg",
        category: "other",
        activity: null,
        highlight: false,
    },
    tunnel_tube: {
        name_de: "Kriechtunnel",
        image: "File:Example of tunnel tube on a playground.jpg",
        category: "other",
        filterable: true,
        activity: "explore",
        highlight: false,
    },
    speaking_tube: {
        name_de: "Sprechrohr",
        image: "File:Speaking Tube - Garden Exhibit - NCSM - Kolkata 2016-06-02 4046.JPG",
        category: "other",
        filterable: true,
        activity: null,
        highlight: true,
    },
    hopscotch: {
        name_de: "Hüpfspiel",
        image: "File:Hinkelbaan tegels.jpg",
        category: "motion",
        activity: "bounce",
        highlight: false,
    },
    funnel_ball: {
        name_de: "Trichterball",
        image: "File:Funnel_ball.jpg",
        category: "other",
        activity: null,
        highlight: true,
    },
    ball_pool: {
        name_de: "Bällebad",
        image: "File:At children's level.jpg",
        category: "other",
        activity: null,
        highlight: true,
    },
    ride_on: {
        name_de: "Sitztier",
        image: "File:Playground riding animal Thomashöhe Berlin Neukölln.jpg",
        category: "other",
        activity: null,
        highlight: false,
    },
    track: {
        name_de: "Rennstrecke",
        image: "File:Playground track Buschkrugallee-Havermannstraße Berlin Britz.jpg",
        category: "motion",
        activity: null,
        highlight: false,
    },
    marble_run: {
        name_de: "Murmelspiel",
        image: "File:Rachau Wipfelwanderweg 75.jpg",
        category: "other",
        activity: null,
        highlight: true,
    },
    map: {
        name_de: "Landkarte",
        image: "File:Playground Map, Washington Elementary.jpg",
        category: "other",
        activity: null,
        highlight: false,
    },
    blackboard: {
        name_de: "Tafel",
        image: "File:Playground chalk board.jpg",
        category: "other",
        activity: null,
        highlight: false,
    },
    musical_instrument: {
        name_de: "Musikinstrument",
        image: "File:Play xylophone in a playground.jpeg",
        category: "other",
        activity: null,
        highlight: true,
    },
    table: {
        name_de: "Spieltisch",
        image: "File:Playground table Herrfurthstraße Berlin Neukölln.jpg",
        category: "sand",
        activity: "dig",
        highlight: false,
    },
    seat: {
        name_de: "Sitz",
        image: "File:Playground seat Hattenheimer Straße Berlin Tempelhof.jpg",
        category: "other",
        activity: null,
        highlight: false,
    },
    hammock: {
        name_de: "Hängematte",
        image: "File:Playground hammock.jpg",
        category: "other",
        filterable: true,
        activity: null,
        highlight: false,
    },
    sledding: {
        name_de: "Rodelstrecke",
        image: "File:Prangli lapsed kelgutamas.jpg",
        category: "motion",
        activity: null,
        highlight: true,
    },
    youth_bench: {
        name_de: "Jugendbank",
        image: "File:Youth_bench.jpg",
        category: "other",
        activity: null,
        highlight: false,
    },
    mound: {
        name_de: "Spielhügel",
        image: "File:Hunters Point South Pk td (2019-06-10) 069 - Playground.jpg",
        category: "topographical",
        activity: "climb",
        highlight: false,
    },
    dome: {
        name_de: "Halbkugel",
        image: "File:Playground dome metal.jpg",
        category: "topographical",
        activity: "climb",
        highlight: false,
    },
    // OSM-Fallback-Values
    balance: {
        name_de: "Balanciergerät",
        image: false,
        category: "balance",
        activity: "balance",
        highlight: false,
    },
    climbing: {
        name_de: "Klettergerät",
        image: false,
        category: "climbing",
        activity: "climb",
        highlight: false,
    },
    rotator: {
        name_de: "Rotationsgerät",
        image: false,
        category: "rotating",
        activity: "spin",
        highlight: false,
    },
    water: {
        name_de: "Wasserspiele",
        image: false,
        category: "water",
        activity: null,
        highlight: false,
    },
    sand: {
        name_de: "Sandspielelement",
        image: false,
        category: "sand",
        activity: "dig",
        highlight: false,
    },
}

// Deutschen Namen für fitness_station=* Werte (leisure=fitness_station)
export const objFitnessStation = {
    horizontal_bar:    'Klimmzugstange',
    parallel_bars:     'Barren',
    push_up:           'Liegestützgerät',
    sit_up:            'Bauchtrainer',
    balance_beam:      'Balancierbalken',
    elliptical_trainer:'Crosstrainer',
    exercise_stairs:   'Treppenstufen',
    rowing:            'Rudergerät',
    bicycle:           'Radergometer',
    sign:              'Informationsschild',
    stepping_stone:    'Trittsteine',
    training_wall:     'Trainingswall',
    wall_bars:         'Sprossenwand',
    dip:               'Dip-Station',
    slalom_bars:       'Slalomstangen',
    stretching:        'Streckgerät',
    air_walker:        'Luftläufer',
    chest_press:       'Brustpresse',
    leg_press:         'Beinpresse',
    rotary_torso:      'Rumpfrotation',
    archery:           'Bogenschießen',
};

// Hinweis: Speziellere Features müssen sich in der Reihenfolge der Einträge immer _vor_ allgemeineren Features befinden, um korrekt differenziert zu werden
// z.B. amenity=bench + backrest=yes vor amenity=bench, damit letzteres nur für Sitzbänke greift, die nicht mit backrest=yes getaggt sind
export const objFeatures = {
    artwork: {
        tags: {
            tourism: "artwork",
        },
        name_de: "Kunstwerk",
        icon: "artwork",
        size: 12,
    },
    bicycle_parking: {
        tags: {
            amenity: "bicycle_parking",
        },
        name_de: "Fahrradständer",
        icon: "bicycle_parking",
        size: 16,
    },
    bench_backrest: {
        tags: {
            amenity: "bench",
            backrest: "yes",
        },
        name_de: "Sitzbank",
        icon: "bench_backrest_yes",
        size: 12,
    },
    bench: {
        tags: {
            amenity: "bench",
        },
        name_de: "Sitzbank",
        icon: "bench_backrest_no",
        size: 12,
    },
    gate: {
        tags: {
            barrier: "gate",
        },
        name_de: "Eingangstor",
        icon: "gate",
        size: 12,
    },
    shelter: {
        tags: {
            amenity: "shelter",
        },
        name_de: "Unterstand",
        icon: "shelter",
        size: 12,
    },
    picnic_table: {
        tags: {
            leisure: "picnic_table",
        },
        name_de: "Picknicktisch",
        icon: "picnic_table",
        size: 12,
    },
    table_tennis: {
        tags: {
            leisure: "pitch",
            sport: "table_tennis",
        },
        name_de: "Tischtennisplatte",
        icon: "table_tennis",
        size: 12,
        image: "File:Outdoor table tennis - geograph.org.uk - 7959772.jpg",
    },
    soccer: {
        tags: {
            leisure: "pitch",
            sport: "soccer",
        },
        name_de: "Bolzplatz",
        icon: "soccer",
        size: 12,
        image: "File:Erlebnisspielplatz Marsbachtal Bolzplatz mit Kleintoren.jpg",
    },
    basketball: {
        tags: {
            leisure: "pitch",
            sport: "basketball",
        },
        name_de: "Basketballfeld",
        icon: "basketball",
        size: 12,
        image: "File:Basketball court.jpg",
    },
    pitch: {
        tags: {
            leisure: "pitch",
        },
        name_de: "Sportfeld",
        icon: "pitch",
        size: 20,
    },
    shrub: {
        tags: {
            natural: "shrub",
        },
        name_de: "Busch",
        icon: "shrub",
        size: 12,
    },
    tree_evergreen: {
        tags: {
            natural: "tree",
            leaf_type: "needleleaved",
        },
        name_de: "Baum",
        icon: "tree_needleleaved",
        size: 12,
    },
    tree: {
        tags: {
            natural: "tree",
        },
        name_de: "Baum",
        icon: "tree_broadleaved",
        size: 12,
    },
    waste_basket: {
        tags: {
            amenity: "waste_basket",
        },
        name_de: "Abfallbehälter",
        icon: "waste_basket",
        size: 10,
    },
}