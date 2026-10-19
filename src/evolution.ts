/* =============================================================================
 * SimEarth 2.0 — the evolution tree
 * -----------------------------------------------------------------------------
 * One table, read by everything: the simulation checks its conditions, the
 * tree window draws it, the event cards quote it and the save file names its
 * ids. Nothing about a step is stated twice.
 *
 * Three relations are kept strictly apart, because the original game blurred
 * them and the tree has to make them legible:
 *
 *   parent   evolutionary descent — the lineage a group arises from. Drawn as
 *            a solid line. The parent group does not disappear: the line means
 *            "arose from early members of", never "turned into".
 *   habitat  the environment a group needs: a kind of place (shore, wetland,
 *            open sea...) and, for some, enough oxygen. Shown as chips.
 *   eco      what it needs from other living things: food, a partner, a soil
 *            built by earlier plants. Drawn as a dashed line — a food plant is
 *            never shown as an ancestor.
 *
 * A step becomes available when its parent lives on the planet, the habitat
 * exists next to that parent, the ecological partners are established and
 * the player can pay for it. Developing it founds the first populations.
 * ========================================================================== */

namespace SE {
  export type Kingdom = 'origin' | 'plant' | 'animal';

  export type HabitatTag =
    'coastalsea' | 'opensea' | 'freshwater' | 'shore' | 'wetland' |
    'moist' | 'dryland' | 'cold' | 'forest' | 'atmosphere';

  export const HABITAT_TAG_NAMES: Readonly<Record<HabitatTag, string>> = {
    coastalsea: 'Küstenmeer',
    opensea: 'Hochsee',
    freshwater: 'Süßwasser',
    shore: 'Uferzone',
    wetland: 'Feuchtgebiet',
    moist: 'Feuchter Boden',
    dryland: 'Trockenes Land',
    cold: 'Kalte Gebiete',
    forest: 'Wald',
    atmosphere: 'Atmosphäre',
  };

  export type EcoKind = 'food' | 'partner' | 'soil';

  export interface EcoNeed {
    readonly kind: EcoKind;
    /** What is needed, as a noun: "Nahrung", "Blütenangebot"... */
    readonly label: string;
    /** Any one of these nodes, established on the planet, satisfies it. */
    readonly any: readonly string[];
  }

  export interface EvoEventText {
    readonly title: string;
    /** One or two plain sentences about what happened. */
    readonly text: string;
    /** What concretely changed in the game. */
    readonly change: string;
    /** Bigger milestones get a more prominent card. */
    readonly major?: boolean;
  }

  export interface EvoNode {
    readonly id: string;
    readonly kingdom: Kingdom;
    readonly name: string;
    /** A second line: the scientific group or examples. */
    readonly short: string;
    readonly life?: Life;
    readonly flora?: Flora;
    readonly parent: string | null;
    /** Annotation on the lineage line, e.g. "über Synapsiden". */
    readonly lineageNote?: string;
    /** Extra oxygen condition, percent. Animals derive theirs from LIFE. */
    readonly o2?: number;
    readonly habitat: { readonly tags: readonly HabitatTag[]; readonly text: string };
    readonly eco: readonly EcoNeed[];
    /** Evolution points. */
    readonly cost: number;
    /** Layout in the tree: column (time) and row (negative = plants). */
    readonly col: number;
    readonly row: number;
    readonly description: string;
    readonly ecosystem: string;
    readonly benefits: readonly string[];
    readonly event: EvoEventText;
  }

  /** Era bands across the top of the tree — a playful order, not geology. */
  export const EVO_ERAS: readonly { readonly from: number; readonly to: number; readonly name: string }[] = [
    { from: 0, to: 1, name: 'Urozean' },
    { from: 2, to: 3, name: 'Leben im Meer' },
    { from: 4, to: 5, name: 'Ufer & Feuchtgebiete' },
    { from: 6, to: 7, name: 'Flüsse & erste Wälder' },
    { from: 8, to: 9, name: 'Samen, Blüten & Vielfalt' },
  ];

  export const EVO_NODES: readonly EvoNode[] = [
    /* ================================================================ origin */
    {
      id: 'cells', kingdom: 'origin', name: 'Erste Zellen', short: 'Archaeen & Bakterien',
      life: Life.Prokaryote, parent: null,
      habitat: { tags: ['coastalsea'], text: 'Lichtdurchflutetes Küstenmeer' },
      eco: [], cost: 0, col: 0, row: 0,
      description: 'Frühe Bakterien und Archaeen ohne Zellkern. Ihre ersten Vertreter besiedelten das junge Meer ohne freien Sauerstoff.',
      ecosystem: 'Sie bilden die Grundlage der Nahrungsketten im Meer. Erst wenn sich Cyanobakterien innerhalb dieser Gruppe entwickeln, setzen sie durch Photosynthese Sauerstoff frei.',
      benefits: [
        'Leben im Küstenmeer – der Planet beginnt zu leben',
        'Anfangs ohne Sauerstoffproduktion – bis Cyanobakterien auftreten',
        'Ab jetzt sammelst du Evolutionspunkte',
      ],
      event: {
        title: 'Leben entsteht',
        text: 'Im jungen Meer teilen sich die ersten Zellen. Bakterien und Archaeen besiedeln eine Welt ohne freien Sauerstoff.',
        change: 'Erste Zellen besiedeln das Küstenmeer. Ab jetzt sammelst du Evolutionspunkte.',
        major: true,
      },
    },
    {
      id: 'eukaryotes', kingdom: 'origin', name: 'Komplexe Zellen', short: 'Eukaryoten',
      life: Life.Eukaryote, parent: 'cells', lineageNote: 'Endosymbiose',
      habitat: { tags: ['coastalsea'], text: 'Küstenmeer mit etwas Sauerstoff' },
      eco: [], cost: 10, col: 1, row: 0,
      description: 'Einzeller mit Zellkern. Ihre Mitochondrien waren einst freilebende Bakterien. Von solchen Zellen stammen Algen und Tiere gleichermaßen ab.',
      ecosystem: 'Sie fressen Bakterien und bereichern das Plankton. Hier trennen sich Pflanzen- und Tierlinie – Tiere stammen nicht von Pflanzen ab.',
      benefits: [
        'Öffnet die Pflanzenlinie (Meeresalgen)',
        'Öffnet die Tierlinie (Schwämme & Nesseltiere)',
        'Mehr Artenvielfalt im Plankton',
      ],
      event: {
        title: 'Zellen mit Kern',
        text: 'Einzeller mit Zellkern entstehen. Mitochondrien – einst freilebende Bakterien – versorgen sie mit Energie.',
        change: 'Komplexe Zellen leben im Küstenmeer. Pflanzen- und Tierlinie können sich nun getrennt entwickeln.',
      },
    },

    /* ================================================================ plants */
    {
      id: 'marineAlgae', kingdom: 'plant', name: 'Meeresalgen', short: 'Rot- & Grünalgen',
      flora: Flora.MarineAlgae, parent: 'eukaryotes', lineageNote: 'Chloroplasten',
      habitat: { tags: ['coastalsea'], text: 'Lichtdurchflutetes, nicht vereistes Küstenmeer' },
      eco: [], cost: 15, col: 2, row: -1,
      description: 'Rot- und Grünalgen. Ihre Chloroplasten gehen auf ein Cyanobakterium zurück, das ein Einzeller aufgenommen hat. Sie bilden Algenwiesen im flachen Wasser.',
      ecosystem: 'Algenwiesen liefern Sauerstoff und sind Weidegrund für Weichtiere, Würmer und Gliederfüßer.',
      benefits: [
        'Algen wachsen im Küstenmeer und liefern zusätzlichen Sauerstoff',
        'Nahrung für Weichtiere, Würmer und Gliederfüßer',
        'Aus einer Grünalgen-Linie gehen Süßwasser-Grünalgen hervor',
      ],
      event: {
        title: 'Wiesen unter Wasser',
        text: 'Algenwiesen breiten sich im flachen, sonnigen Küstenwasser aus.',
        change: 'Meeresalgen wachsen im Küstenmeer: mehr Sauerstoff und Nahrung für Meerestiere.',
      },
    },
    {
      id: 'freshwaterAlgae', kingdom: 'plant', name: 'Süßwasser-Grünalgen', short: 'Streptophyten-Algen',
      flora: Flora.FreshwaterAlgae, parent: 'marineAlgae', lineageNote: 'Grünalgen-Linie',
      habitat: { tags: ['freshwater'], text: 'Flüsse, Flussmündungen und Feuchtgebiete' },
      eco: [], cost: 25, col: 3, row: -1,
      description: 'Eine Linie früher Grünalgen eroberte Süßwasser und feuchte Böden. Aus Verwandten der heutigen Jochalgen gingen die Landpflanzen hervor – die meisten anderen Grünalgen blieben im Meer.',
      ecosystem: 'Sie besiedeln Mündungen und Flüsse und überstehen wechselnde Wasserstände – der Schritt vor dem Landgang.',
      benefits: [
        'Grünalgen besiedeln Flüsse und Feuchtgebiete',
        'Öffnet den Weg zu den ersten Landpflanzen',
      ],
      event: {
        title: 'Ins Süßwasser',
        text: 'Eine Linie der Grünalgen erobert Flussmündungen und Flüsse. Ihre Nachfahren werden einmal das Land begrünen.',
        change: 'Süßwasser-Grünalgen besiedeln Flüsse und Feuchtgebiete.',
      },
    },
    {
      id: 'landPlants', kingdom: 'plant', name: 'Erste Landpflanzen', short: 'frühe Sporenpflanzen',
      flora: Flora.LandPlants, parent: 'freshwaterAlgae', lineageNote: 'Landgang',
      o2: 2,
      habitat: { tags: ['shore', 'atmosphere'], text: 'Feuchte Uferzonen an Küsten und Flüssen' },
      eco: [], cost: 35, col: 4, row: -1,
      description: 'Kleine, flache Pflanzen ohne Leitgewebe, ähnlich heutigen Lebermoosen. Eine Wachsschicht schützt sie vor dem Austrocknen, die Ozonschicht vor UV-Strahlung.',
      ecosystem: 'Sie bilden die ersten grünen Säume an Land, halten Feuchtigkeit und schaffen Lebensraum für die ersten Landtiere.',
      benefits: [
        'Pflanzen wachsen an feuchten Küsten, Flussufern und in Feuchtgebieten',
        'Photosynthese an Land: mehr Sauerstoff',
        'Öffnet Moose, Gefäßpflanzen und die ersten Landtiere',
      ],
      event: {
        title: 'Die Ufer werden grün',
        text: 'Erste kleine Landpflanzen besiedeln die feuchten Randbereiche. Dein Ökosystem erschließt einen neuen Lebensraum.',
        change: 'Pflanzen wachsen jetzt an feuchten Küsten, Flussufern und in Feuchtgebieten.',
        major: true,
      },
    },
    {
      id: 'mosses', kingdom: 'plant', name: 'Moose', short: 'Laub-, Leber- & Hornmoose',
      flora: Flora.Mosses, parent: 'landPlants',
      habitat: { tags: ['moist', 'wetland', 'cold'], text: 'Feuchte Standorte – Sümpfe, Ufer, Tundra' },
      eco: [], cost: 40, col: 5, row: -2,
      description: 'Eine eigene Linie neben den Gefäßpflanzen – keine Vorstufe der Farne. Moose brauchen Wasser zur Fortpflanzung; viele überstehen aber lange Trockenheit und wachsen sogar auf nacktem Fels.',
      ecosystem: 'Moospolster speichern Wasser und bilden Boden. Sie bleiben auch später dort, wo es für größere Pflanzen zu nass oder zu kalt ist.',
      benefits: [
        'Moose begrünen feuchte und kalte Gebiete bis in die Hochlagen',
        'Kalte, bemooste Ebenen werden zur Tundra',
        'Bodenbildung: Voraussetzung für Urbäume (alternativ Farne)',
        'Nahrung für Landgliederfüßer',
      ],
      event: {
        title: 'Grüne Polster',
        text: 'Moose breiten sich an feuchten Standorten aus – von Sumpfrändern bis in die kühle Tundra.',
        change: 'Moose wachsen an feuchten und kalten Orten; die Tundra wird belebt.',
      },
    },
    {
      id: 'vascular', kingdom: 'plant', name: 'Frühe Gefäßpflanzen', short: 'z. B. Cooksonia',
      flora: Flora.Vascular, parent: 'landPlants', lineageNote: 'Leitgewebe',
      habitat: { tags: ['freshwater', 'shore'], text: 'Flussufer, Auen und feuchte Ebenen' },
      eco: [], cost: 50, col: 5, row: -1,
      description: 'Pflanzen mit Leitbündeln, die Wasser nach oben führen. Feste Stängel tragen sie aufrecht und höher als Moose.',
      ecosystem: 'Entlang der Flüsse entstehen grüne Korridore. Ihre Stängel sind Nahrung und Deckung für Insekten.',
      benefits: [
        'Grüne Bänder entlang der Flüsse und in Feuchtgebieten',
        'Dichtere Pflanzendecke, mehr Sauerstoff',
        'Nahrungsgrundlage für Insekten',
        'Öffnet Bärlapppflanzen, Farne und Urbäume',
      ],
      event: {
        title: 'Grüne Flussläufe',
        text: 'Gefäßpflanzen folgen den Flüssen ins Landesinnere. Entlang der Ufer entstehen grüne Bänder.',
        change: 'Pflanzen wachsen dichter und breiten sich entlang der Flussläufe aus.',
        major: true,
      },
    },
    {
      id: 'clubmosses', kingdom: 'plant', name: 'Bärlapppflanzen', short: 'Bärlappe & Schuppenbäume',
      flora: Flora.Clubmosses, parent: 'vascular', lineageNote: 'Bärlapp-Linie',
      habitat: { tags: ['wetland'], text: 'Warme Sümpfe und nasse Niederungen' },
      eco: [], cost: 60, col: 6, row: -3,
      description: 'Bärlappe und die baumhohen Schuppenbäume. Ihre Sumpfwälder bedeckten einst weite Niederungen. ' +
        'Nadelbäume und später Laubbäume verdrängten die Schuppenbäume; heute leben nur noch kleine, krautige Bärlappe in feuchten Nischen.',
      ecosystem: 'Sumpfwälder binden viel Kohlenstoff und bieten Amphibien und Insekten Lebensraum.',
      benefits: [
        'Warme Sümpfe werden zu dichten Sumpfwäldern',
        'Ihre Sumpfwälder werden über Jahrmillionen zu Kohle',
        'Viel Pflanzendecke: mehr Sauerstoff, weniger CO₂',
        'Nahrung für Insekten und Dinosaurier',
      ],
      event: {
        title: 'Wälder im Sumpf',
        text: 'Schuppenbäume wachsen aus nassen Niederungen empor. Die ersten Sumpfwälder entstehen.',
        change: 'Bärlapppflanzen bilden Sumpfwälder in warmen Feuchtgebieten.',
      },
    },
    {
      id: 'ferns', kingdom: 'plant', name: 'Farne & Schachtelhalme', short: 'Farne, Schachtelhalme, Baumfarne',
      flora: Flora.Ferns, parent: 'vascular', lineageNote: 'Farn-Linie',
      habitat: { tags: ['moist'], text: 'Feuchte, auch schattige Standorte' },
      eco: [], cost: 60, col: 6, row: -2,
      description: 'Eine eigene Linie der Gefäßpflanzen mit großen Wedeln, die sich über Sporen vermehrt. Schachtelhalme gehören dazu.',
      ecosystem: 'Farnfluren und Baumfarne bedecken feuchte Böden, bilden Humus und ernähren große Pflanzenfresser.',
      benefits: [
        'Farne besiedeln feuchte Gebiete auch abseits der Flüsse',
        'Bodenbildung: Voraussetzung für Urbäume (alternativ Moose)',
        'Nahrung für Insekten, Reptilien und Dinosaurier',
      ],
      event: {
        title: 'Wedel im Wind',
        text: 'Farne und Schachtelhalme entrollen ihre Wedel. Feuchte Ebenen werden grün.',
        change: 'Farne breiten sich an feuchten Orten auch fern der Flüsse aus.',
      },
    },
    {
      id: 'firstTrees', kingdom: 'plant', name: 'Urbäume', short: 'Archaeopteris',
      flora: Flora.FirstTrees, parent: 'vascular', lineageNote: 'Progymnospermen',
      habitat: { tags: ['moist', 'forest'], text: 'Feuchte Tiefländer' },
      eco: [{ kind: 'soil', label: 'Boden aus früherem Pflanzenwuchs', any: ['mosses', 'ferns'] }],
      cost: 75, col: 6, row: -1,
      description: 'Archaeopteris gilt als erster „moderner“ Baum mit Holz, Laub und tiefen Wurzeln und gehört zu den Vorläufern der Samenpflanzen. Kurz zuvor bildeten farnverwandte Sporenbäume die allerersten Wälder.',
      ecosystem: 'Wurzeln vertiefen den Boden, Laub fällt zu Boden: Es entstehen die ersten Wälder mit Schatten und Streu.',
      benefits: [
        'Erste Wälder: feuchte Gebiete werden zu Wald und Regenwald',
        'Viel Pflanzendecke und Sauerstoff',
        'Öffnet die Samenpflanzen',
      ],
      event: {
        title: 'Die ersten Wälder',
        text: 'Mit Holz und tiefen Wurzeln wachsen die ersten echten Bäume. Schattige Wälder verändern das Land.',
        change: 'Urbäume bilden Wälder in feuchten Tiefländern.',
        major: true,
      },
    },
    {
      id: 'seedPlants', kingdom: 'plant', name: 'Samenpflanzen', short: 'Samenfarne & Verwandte',
      flora: Flora.SeedPlants, parent: 'firstTrees',
      habitat: { tags: ['dryland', 'moist'], text: 'Auch trockenere Böden im Landesinneren' },
      eco: [], cost: 85, col: 7, row: -1,
      description: 'Frühe Samenpflanzen – sogenannte Samenfarne, trotz des Namens keine Farne. Ihr Nachwuchs reift geschützt im Samen heran, unabhängig von Wasser zur Befruchtung.',
      ecosystem: 'Samen sind nahrhaft und lassen Pflanzen ins trockenere Landesinnere vordringen – Pflanzenfresser folgen ihnen.',
      benefits: [
        'Pflanzen erobern trockeneres Land im Landesinneren',
        'Samen ernähren Reptilien, Vögel und Säugetiere',
        'Öffnet Nadelbäume und Blütenpflanzen',
      ],
      event: {
        title: 'Leben im Samen',
        text: 'Samenpflanzen tragen ihren Nachwuchs gut verpackt in die Welt – unabhängig vom Wasser.',
        change: 'Pflanzen breiten sich nun auch in trockeneren Regionen aus.',
      },
    },
    {
      id: 'conifers', kingdom: 'plant', name: 'Nadelbäume', short: 'Koniferen',
      flora: Flora.Conifers, parent: 'seedPlants',
      habitat: { tags: ['cold', 'dryland'], text: 'Kühle, auch trockenere Regionen und Gebirge' },
      eco: [], cost: 95, col: 8, row: -2,
      description: 'Nacktsamer mit Nadeln und Zapfen. Sie ertragen Kälte und Trockenheit besser als viele andere Bäume.',
      ecosystem: 'Nadelwälder bedecken kalte Regionen und Gebirgshänge und bieten Tieren Schutz im Winter.',
      benefits: [
        'Kalte Gebiete werden zu Nadelwald',
        'Wälder bis in höhere Lagen',
        'Nahrung für Dinosaurier und Säugetiere',
      ],
      event: {
        title: 'Wälder der Kälte',
        text: 'Nadelbäume trotzen Frost und Trockenheit. In kühlen Regionen wachsen ausgedehnte Nadelwälder.',
        change: 'Kalte Gebiete und Gebirgshänge werden zu Nadelwald.',
      },
    },
    {
      id: 'flowering', kingdom: 'plant', name: 'Blütenpflanzen', short: 'Bedecktsamer',
      flora: Flora.Flowering, parent: 'seedPlants', lineageNote: 'Bedecktsamer',
      habitat: { tags: ['moist', 'dryland'], text: 'Zuerst feuchte Ufer und Unterholz, später fast überall' },
      eco: [], cost: 110, col: 8, row: -1,
      description: 'Pflanzen mit Blüten und Früchten, entstanden aus der Verwandtschaft der Samenpflanzen. Die ersten Blüten bestäubten vor allem Käfer, Fliegen und Thripse – spezialisierte Bestäuber kamen erst später.',
      ecosystem: 'Die ersten Blütenpflanzen waren unscheinbare Kräuter und Sträucher an feuchten Ufern. Blüten bieten Nektar und Pollen, Früchte ernähren Tiere, die Samen verbreiten.',
      benefits: [
        'Blühende Pflanzen breiten sich rasch auf vielen Standorten aus',
        'Öffnet Laubbäume, Gräser und fleischfressende Pflanzen',
        'Blütenangebot für Bienen & Bestäuber',
      ],
      event: {
        title: 'Die Welt erblüht',
        text: 'Die ersten Blüten öffnen sich. Käfer und Fliegen besuchen sie und tragen Pollen von Blüte zu Blüte – ganz ohne spezialisierte Bestäuber.',
        change: 'Blütenpflanzen breiten sich aus. Spezialisierte Bestäuber können sich nun entwickeln.',
        major: true,
      },
    },
    {
      id: 'broadleaf', kingdom: 'plant', name: 'Laubbäume', short: 'blühende Laubbäume',
      flora: Flora.Broadleaf, parent: 'flowering',
      habitat: { tags: ['moist', 'forest'], text: 'Gemäßigte und tropische feuchte Regionen' },
      eco: [], cost: 120, col: 9, row: -1,
      description: 'Blühende Bäume wie Magnolien, Eichen oder Buchen. Sie stammen aus der Linie der Blütenpflanzen und sind nicht der Ursprung aller Bäume.',
      ecosystem: 'Laub- und Regenwälder werden besonders dicht und artenreich.',
      benefits: [
        'Die dichtesten Wälder: Laub- und Regenwälder',
        'Blüten und Früchte für Bestäuber, Vögel und Säugetiere',
        'Wachsen mit Bestäubern noch dichter',
      ],
      event: {
        title: 'Blühende Wälder',
        text: 'Laubbäume mit Blüten und Früchten wachsen zu dichten, artenreichen Wäldern heran.',
        change: 'Laubbäume bilden dichte Wälder und Regenwälder.',
      },
    },
    {
      id: 'grasses', kingdom: 'plant', name: 'Gräser', short: 'windbestäubte Blütenpflanzen',
      flora: Flora.Grasses, parent: 'flowering',
      habitat: { tags: ['dryland'], text: 'Offene, eher trockene Ebenen' },
      eco: [], cost: 110, col: 9, row: -2,
      description: 'Gräser sind Blütenpflanzen, die – wie einige Linien später – zur Windbestäubung übergingen. Sie wachsen von unten nach und überstehen Trockenheit und Beweidung.',
      ecosystem: 'Graslandschaften entstehen, wo es für Wald zu trocken ist – die Lebensgrundlage großer Weidetiere.',
      benefits: [
        'Grasland in trockeneren Regionen, Wüstenränder werden grüner',
        'Nahrung für Huftiere & Weidetiere',
        'Samen für Vögel und Säugetiere',
      ],
      event: {
        title: 'Ein Meer aus Gras',
        text: 'Gräser breiten sich über offene, trockenere Ebenen aus. Weite Graslandschaften entstehen.',
        change: 'Gräser begrünen trockene Ebenen und ernähren künftige Weidetiere.',
      },
    },
    {
      id: 'carnivorous', kingdom: 'plant', name: 'Fleischfressende Pflanzen', short: 'Sonnentau & Co.',
      flora: Flora.Carnivorous, parent: 'flowering',
      habitat: { tags: ['wetland'], text: 'Nährstoffarme Moore und Sümpfe' },
      eco: [{ kind: 'food', label: 'Beute', any: ['insects'] }],
      cost: 90, col: 9, row: -3,
      description: 'Blütenpflanzen, die Insekten fangen, um den Nährstoffmangel nasser Moore auszugleichen. Im Original-SimEarth als „Carnifern“ bekannt.',
      ecosystem: 'Sie besiedeln Moore, in denen andere Pflanzen hungern – Insekten liefern ihnen die fehlenden Nährstoffe.',
      benefits: [
        'Begrünt nährstoffarme Moore und Sümpfe',
        'Wachsen dichter, wo Insekten leben',
        'Mehr Artenvielfalt – mehr Evolutionspunkte',
      ],
      event: {
        title: 'Fallen im Moor',
        text: 'In nährstoffarmen Mooren fangen Pflanzen Insekten – eine überraschende Verbindung zwischen Pflanzen- und Tierwelt.',
        change: 'Fleischfressende Pflanzen besiedeln Moore; wo Insekten leben, gedeihen sie besser.',
      },
    },

    /* =============================================================== animals */
    {
      id: 'earlyAnimals', kingdom: 'animal', name: 'Schwämme & Nesseltiere', short: 'erste Tiere',
      life: Life.Radiate, parent: 'eukaryotes', lineageNote: 'Vielzeller',
      habitat: { tags: ['coastalsea'], text: 'Lichtdurchflutetes Küstenmeer' },
      eco: [{ kind: 'food', label: 'Plankton', any: ['cells', 'eukaryotes'] }],
      cost: 20, col: 2, row: 1,
      description: 'Schwämme, Quallen und Korallen gehören zu den ältesten Tierlinien. Sie filtern Plankton aus dem Wasser.',
      ecosystem: 'Sie leben vom Plankton der ersten Zellen und bauen Riffe, in denen später viele Meerestiere leben.',
      benefits: [
        'Die ersten Tiere im Küstenmeer',
        'Öffnet die frühen Zweiseitentiere',
      ],
      event: {
        title: 'Die ersten Tiere',
        text: 'Vielzellige Tiere entstehen: Schwämme filtern das Wasser, Quallen treiben im Licht.',
        change: 'Schwämme & Nesseltiere leben im Küstenmeer.',
        major: true,
      },
    },
    {
      id: 'bilaterians', kingdom: 'animal', name: 'Frühe Zweiseitentiere', short: 'Würmer',
      life: Life.Bilateria, parent: 'earlyAnimals', lineageNote: 'Bilateria',
      habitat: { tags: ['coastalsea'], text: 'Meeresboden im Küstenmeer' },
      eco: [{ kind: 'food', label: 'Nahrung', any: ['cells', 'eukaryotes', 'marineAlgae'] }],
      cost: 25, col: 3, row: 1,
      description: 'Würmer mit Vorder- und Hinterende, Mund und Darm. Aus frühen Zweiseitentieren gehen Gliederfüßer, Weichtiere und Chordatiere hervor.',
      ecosystem: 'Sie durchwühlen den Meeresboden, verwerten Abgestorbenes und werden selbst zur Beute.',
      benefits: [
        'Leben im Sediment des Küstenmeers',
        'Beute für Gliederfüßer und Fische',
        'Öffnet Gliederfüßer, Weichtiere und Fische',
      ],
      event: {
        title: 'Vorne und hinten',
        text: 'Die ersten Würmer graben sich durch den Meeresboden – Tiere mit Kopf, Darm und Richtung.',
        change: 'Frühe Zweiseitentiere leben im Küstenmeer und öffnen drei neue Tierlinien.',
      },
    },
    {
      id: 'arthropods', kingdom: 'animal', name: 'Gliederfüßer des Meeres', short: 'Trilobiten, Krebstiere',
      life: Life.Arthropod, parent: 'bilaterians',
      habitat: { tags: ['coastalsea'], text: 'Meeresgrund im Küstenmeer' },
      eco: [{ kind: 'food', label: 'Nahrung', any: ['marineAlgae', 'bilaterians'] }],
      cost: 30, col: 4, row: 1,
      description: 'Trilobiten, Seeskorpione und Krebstiere mit Außenskelett und gegliederten Beinen.',
      ecosystem: 'Sie fressen Algen und Würmer und sind selbst wichtige Beute für Fische und Wale.',
      benefits: [
        'Neue Meerestiere am Meeresgrund',
        'Beute für Fische und Wale',
        'Öffnet Landgliederfüßer und Insekten',
      ],
      event: {
        title: 'Panzer und Beine',
        text: 'Trilobiten und Krebstiere krabbeln über den Meeresboden.',
        change: 'Gliederfüßer bevölkern das Küstenmeer.',
      },
    },
    {
      id: 'molluscs', kingdom: 'animal', name: 'Weichtiere', short: 'Schnecken, Ammoniten',
      life: Life.Mollusc, parent: 'bilaterians',
      habitat: { tags: ['coastalsea'], text: 'Algenreiches Küstenmeer' },
      eco: [{ kind: 'food', label: 'Algenwiesen zum Abweiden', any: ['marineAlgae'] }],
      cost: 30, col: 4, row: 2,
      description: 'Schnecken, Ammoniten und Kopffüßer. Viele Schnecken raspeln mit ihrer Reibezunge (Radula) Algenbeläge ab.',
      ecosystem: 'Direkte Nutzer der Algenwiesen – und Beute für Fische.',
      benefits: [
        'Weichtiere weiden die Algenwiesen ab',
        'Beute für Fische',
        'Können Intelligenz entwickeln (Kopffüßer)',
      ],
      event: {
        title: 'Raspeln am Riff',
        text: 'Schnecken weiden die Algenwiesen ab, Ammoniten treiben im freien Wasser.',
        change: 'Weichtiere leben in den Algenwiesen des Küstenmeers.',
      },
    },
    {
      id: 'fish', kingdom: 'animal', name: 'Fische', short: 'erste Wirbeltiere',
      life: Life.Fish, parent: 'bilaterians', lineageNote: 'über Chordatiere',
      habitat: { tags: ['coastalsea', 'opensea'], text: 'Küstenmeer und Hochsee' },
      eco: [{ kind: 'food', label: 'Beute', any: ['arthropods', 'molluscs', 'bilaterians'] }],
      cost: 45, col: 4, row: 3,
      description: 'Die ersten Wirbeltiere: kieferlose Fische, Panzerfische und schließlich Knochenfische. Sie stammen nicht von Gliederfüßern oder Weichtieren ab.',
      ecosystem: 'Als Räuber brauchen sie wirbellose Beute. Später ernähren Fische Wale und Seevögel.',
      benefits: [
        'Fische besiedeln Küstenmeer und Hochsee',
        'Beute für Wale',
        'Öffnet die Amphibien – den Landgang der Wirbeltiere',
      ],
      event: {
        title: 'Rückgrat im Meer',
        text: 'Fische jagen in Küstenmeer und Hochsee – die ersten Tiere mit Wirbelsäule.',
        change: 'Fische leben in den Meeren, wo sie Beute finden.',
      },
    },
    {
      id: 'landArthropods', kingdom: 'animal', name: 'Landgliederfüßer', short: 'Tausendfüßer & Spinnentiere',
      life: Life.LandArthropod, parent: 'arthropods', lineageNote: 'Landgang',
      habitat: { tags: ['shore', 'moist', 'atmosphere'], text: 'Bewachsenes Ufer in Küstennähe' },
      eco: [{ kind: 'food', label: 'Pflanzen & Pflanzenreste', any: ['landPlants', 'mosses', 'vascular'] }],
      cost: 45, col: 5, row: 1,
      description: 'Schon vor über 400 Millionen Jahren krabbelten Tausendfüßer und Spinnentier-Verwandte an Land. Sie leben in der feuchten Streu unter den ersten Pflanzen.',
      ecosystem: 'Sie zersetzen Pflanzenreste und sind Beute für Amphibien, Reptilien und Vögel.',
      benefits: [
        'Die ersten Tiere an Land',
        'Beute für Amphibien und Reptilien',
      ],
      event: {
        title: 'Landgang',
        text: 'Tausendfüßer und Spinnentiere wagen sich ans Ufer. Unter den ersten Pflanzen finden sie Nahrung und Feuchtigkeit.',
        change: 'Landgliederfüßer leben an Land, wo Pflanzen wachsen.',
        major: true,
      },
    },
    {
      id: 'insects', kingdom: 'animal', name: 'Insekten', short: 'Urinsekten, Libellen, Käfer',
      life: Life.Insect, parent: 'arthropods', lineageNote: 'krebsartige Vorfahren',
      habitat: { tags: ['moist', 'atmosphere'], text: 'Land mit Gefäßpflanzen in Küstennähe' },
      eco: [{ kind: 'food', label: 'Gefäßpflanzen', any: ['vascular', 'ferns', 'clubmosses'] }],
      cost: 60, col: 6, row: 1,
      description: 'Sechsbeinige Gliederfüßer aus krebsartigen Vorfahren. Erste Sechsfüßer lebten vor rund 400 Millionen Jahren, geflügelte Insekten lange vor den ersten Blüten.',
      ecosystem: 'Sie fressen Pflanzen, zersetzen Streu und sind die wichtigste Beute für Amphibien, Reptilien, Vögel und frühe Säugetiere.',
      benefits: [
        'Insekten leben überall, wo Gefäßpflanzen wachsen',
        'Beute für Amphibien, Reptilien, Vögel, Säugetiere',
        'Öffnet Bienen & Bestäuber, sobald es Blüten gibt',
        'Können Intelligenz entwickeln',
      ],
      event: {
        title: 'Summende Ufer',
        text: 'Insekten krabbeln und fliegen zwischen den Gefäßpflanzen – lange bevor es Blüten gibt.',
        change: 'Insekten leben überall, wo Gefäßpflanzen wachsen.',
      },
    },
    {
      id: 'pollinators', kingdom: 'animal', name: 'Bienen & Bestäuber', short: 'spezialisierte Blütenbesucher',
      life: Life.Pollinator, parent: 'insects', lineageNote: 'Blüten-Spezialisten',
      habitat: { tags: ['dryland', 'moist', 'atmosphere'], text: 'Offenes Land und Wälder mit Blüten' },
      eco: [{ kind: 'partner', label: 'Blütenangebot', any: ['flowering', 'broadleaf'] }],
      cost: 100, col: 9, row: 1,
      description: 'Bienen, Schmetterlinge und andere spezialisierte Blütenbesucher. Bienen leben von Pollen und Nektar und sind ganz auf Blüten angewiesen.',
      ecosystem: 'Bestäuber und Blütenpflanzen fördern sich gegenseitig: Nahrung gegen Bestäubung.',
      benefits: [
        'Wo Bestäuber leben, wachsen Blütenpflanzen und Laubbäume 20 % dichter',
        'Blühende Pflanzen breiten sich dort doppelt so schnell aus',
        'Beute für Vögel',
      ],
      event: {
        title: 'Ein Fest für Bestäuber',
        text: 'Das neue Blütenangebot bietet spezialisierten Insekten Nahrung. Eine weitere Verbindung zwischen Pflanzen- und Tierwelt entsteht.',
        change: 'Wo Bestäuber leben, wachsen Blütenpflanzen und Laubbäume dichter und breiten sich schneller aus.',
      },
    },
    {
      id: 'amphibians', kingdom: 'animal', name: 'Amphibien', short: 'frühe Vierfüßer',
      life: Life.Amphibian, parent: 'fish', lineageNote: 'über Fleischflosser',
      habitat: { tags: ['wetland', 'shore', 'atmosphere'], text: 'Sümpfe, Ufer und Feuchtgebiete' },
      eco: [{ kind: 'food', label: 'Beute', any: ['insects', 'landArthropods'] }],
      cost: 70, col: 6, row: 3,
      description: 'Frühe, amphibienartige Vierfüßer gingen aus Fleischflossern hervor. Sie legen ihre Eier im Wasser ab. Aus ihrer Verwandtschaft entstanden die Amnioten mit beschaltem Ei – die Vorfahren von Reptilien und Säugetieren.',
      ecosystem: 'Sie jagen Insekten und Landgliederfüßer am Ufer und brauchen Gewässer in der Nähe.',
      benefits: [
        'Die ersten Wirbeltiere an Land',
        'Öffnet Reptilien und Säugetiere',
      ],
      event: {
        title: 'Vier Beine an Land',
        text: 'Aus Fleischflossern werden Vierfüßer. Amphibien jagen Insekten in Sümpfen und an Ufern.',
        change: 'Amphibien leben in Feuchtgebieten, wo sie Beute finden.',
        major: true,
      },
    },
    {
      id: 'reptiles', kingdom: 'animal', name: 'Reptilien', short: 'Eidechsen & Verwandte',
      life: Life.Reptile, parent: 'amphibians', lineageNote: 'Amnioten · Sauropsiden',
      habitat: { tags: ['dryland', 'atmosphere'], text: 'Auch trockenes Land und Wüsten' },
      eco: [{ kind: 'food', label: 'Nahrung', any: ['insects', 'landArthropods', 'seedPlants'] }],
      cost: 85, col: 7, row: 3,
      description: 'Mit dem beschalten Ei sind Reptilien zur Fortpflanzung nicht mehr auf Gewässer angewiesen und erobern trockenes Land.',
      ecosystem: 'Sie jagen Insekten oder fressen Pflanzen und leben sogar in Wüsten.',
      benefits: [
        'Wirbeltiere erobern trockene Regionen und Wüsten',
        'Öffnet die Dinosaurier',
        'Können Intelligenz entwickeln',
      ],
      event: {
        title: 'Eier mit Schale',
        text: 'Reptilien legen Eier mit fester Schale und brauchen kein Gewässer mehr – trockenes Land wird erobert.',
        change: 'Reptilien leben auch in trockenen Regionen.',
      },
    },
    {
      id: 'mammals', kingdom: 'animal', name: 'Säugetiere', short: 'über Synapsiden',
      life: Life.Mammal, parent: 'amphibians', lineageNote: 'Amnioten · Synapsiden',
      habitat: { tags: ['cold', 'forest', 'atmosphere'], text: 'Vielfältig – auch kalte Regionen' },
      eco: [{ kind: 'food', label: 'Nahrung', any: ['insects', 'landArthropods', 'seedPlants', 'flowering'] }],
      cost: 110, col: 7, row: 4,
      description: 'Säugetiere stammen nicht von Reptilien ab, sondern sind ihre Geschwisterlinie: Beide gehen auf frühe Amnioten zurück, Säugetiere über die Synapsiden. Fell und gleichwarmes Blut machen sie unabhängiger vom Klima.',
      ecosystem: 'Die meisten frühen Säugetiere waren kleine, nachtaktive Insektenfresser; später nutzen sie Samen, Früchte und Gräser.',
      benefits: [
        'Leben auch in kalten Regionen und in der Tundra',
        'Öffnet Wale sowie Huftiere & Weidetiere',
        'Können Intelligenz entwickeln',
      ],
      event: {
        title: 'Warmes Blut',
        text: 'Kleine, felltragende Säugetiere huschen durch das Unterholz und jagen Insekten.',
        change: 'Säugetiere besiedeln auch kühle Regionen.',
        major: true,
      },
    },
    {
      id: 'dinosaurs', kingdom: 'animal', name: 'Dinosaurier', short: 'Sauropoden & Theropoden',
      life: Life.Dinosaur, parent: 'reptiles', lineageNote: 'Archosaurier',
      habitat: { tags: ['dryland', 'forest', 'atmosphere'], text: 'Offenes Land und Wälder' },
      eco: [{ kind: 'food', label: 'Große Pflanzenmengen', any: ['ferns', 'clubmosses', 'seedPlants', 'conifers'] }],
      cost: 110, col: 8, row: 3,
      description: 'Aus frühen Archosauriern hervorgegangen: riesige Pflanzenfresser wie Sauropoden und Räuber wie Theropoden.',
      ecosystem: 'Große Pflanzenfresser brauchen viel Vegetation, Räuber jagen andere Wirbeltiere.',
      benefits: [
        'Große Landtiere in Ebenen und Wäldern',
        'Öffnet die Vögel',
        'Können Intelligenz entwickeln',
      ],
      event: {
        title: 'Zeit der Giganten',
        text: 'Dinosaurier durchstreifen Farnwälder und Ebenen. Manche werden riesig.',
        change: 'Dinosaurier leben dort, wo genug Pflanzen wachsen.',
      },
    },
    {
      id: 'birds', kingdom: 'animal', name: 'Vögel', short: 'gefiederte Dinosaurier',
      life: Life.Avian, parent: 'dinosaurs', lineageNote: 'Theropoden',
      habitat: { tags: ['forest', 'dryland', 'atmosphere'], text: 'Fast überall – auch Inseln' },
      eco: [{ kind: 'food', label: 'Nahrung', any: ['insects', 'pollinators', 'seedPlants', 'flowering'] }],
      cost: 120, col: 9, row: 3,
      description: 'Vögel sind die heute lebenden Nachfahren gefiederter Raubdinosaurier. Fliegend überqueren sie Meere und Gebirge.',
      ecosystem: 'Sie fressen Insekten und Samen und verbreiten Samen weit über das Land.',
      benefits: [
        'Vögel überqueren Meere und besiedeln Inseln',
        'Samenpflanzen verbreiten sich mit Vögeln weiter (mehr Fernverbreitung)',
        'Können Intelligenz entwickeln',
      ],
      event: {
        title: 'Federn und Flügel',
        text: 'Gefiederte Dinosaurier heben ab. Vögel tragen Samen über Meere und Gebirge.',
        change: 'Vögel besiedeln die Kontinente; Samenpflanzen verbreiten sich weiter.',
      },
    },
    {
      id: 'whales', kingdom: 'animal', name: 'Wale', short: 'Säugetiere im Meer',
      life: Life.Cetacean, parent: 'mammals', lineageNote: 'zurück ins Meer',
      habitat: { tags: ['opensea', 'atmosphere'], text: 'Hochsee nahe der Küsten mit Säugetieren' },
      eco: [{ kind: 'food', label: 'Beute', any: ['fish', 'arthropods'] }],
      cost: 130, col: 9, row: 5,
      description: 'Wale stammen von landlebenden Paarhufern ab, die ins Meer zurückkehrten – ihre nächsten lebenden Verwandten sind die Flusspferde. Sie atmen Luft und säugen ihre Jungen.',
      ecosystem: 'Als große Räuber und Planktonfresser brauchen sie reiche Fischbestände oder Krebstiere.',
      benefits: [
        'Säugetiere erobern die Hochsee',
        'Können Intelligenz entwickeln',
      ],
      event: {
        title: 'Zurück ins Meer',
        text: 'Nachfahren landlebender Säugetiere kehren ins Meer zurück und werden zu Walen.',
        change: 'Wale leben auf der Hochsee, wo es Fische oder Krebstiere gibt.',
      },
    },
    {
      id: 'grazers', kingdom: 'animal', name: 'Huftiere & Weidetiere', short: 'Pferde, Antilopen, Bisons',
      life: Life.Grazer, parent: 'mammals',
      habitat: { tags: ['dryland', 'atmosphere'], text: 'Grasland und offene Ebenen' },
      eco: [{ kind: 'food', label: 'Weidegrund', any: ['grasses'] }],
      cost: 130, col: 9, row: 4,
      description: 'Huftiere, deren Zähne und Mägen auf zähe Gräser spezialisiert sind.',
      ecosystem: 'Ohne Grasland keine großen Herden – sie sind die Antwort der Tierwelt auf die Ausbreitung der Gräser.',
      benefits: [
        'Große Herden in Graslandschaften',
        'Beute für Dinosaurier',
      ],
      event: {
        title: 'Herden im Gras',
        text: 'Mit den Gräsern kommen die Weidetiere: Große Herden ziehen über offene Ebenen.',
        change: 'Huftiere & Weidetiere leben in Grasländern.',
      },
    },
  ];

  /** Lookup by id. */
  export const EVO_BY_ID: ReadonlyMap<string, EvoNode> = new Map(EVO_NODES.map((n) => [n.id, n]));

  export function evoNode(id: string): EvoNode {
    const n = EVO_BY_ID.get(id);
    if (!n) throw new Error(`SimEarth: unknown evolution node "${id}"`);
    return n;
  }

  /** The node a life class belongs to. */
  export function nodeForLife(c: Life): EvoNode | undefined {
    return EVO_NODES.find((n) => n.life === c);
  }

  /** The node a flora group belongs to. */
  export function nodeForFlora(g: Flora): EvoNode | undefined {
    return EVO_NODES.find((n) => n.flora === g);
  }

  /** Path of a node's illustration. */
  export function evoIcon(id: string): string {
    return `assets/evolution/${id}.svg`;
  }

  /** Oxygen a node needs before it can take hold, in percent (0 = none). */
  export function nodeO2(n: EvoNode): number {
    if (n.o2 !== undefined) return n.o2;
    // One point above the class's own floor: at the floor itself the oxygen
    // gate in LifeSystem is still zero, so promising "4 %" and then finding no
    // room at 4.0 % would be exactly the mismatch the player cannot debug.
    if (n.life !== undefined) {
      const oxygen = lifeOxygen(n.life);
      if (oxygen.medium === 'air') return oxygen.establish;
    }
    return 0;
  }

  export function nodeOceanO2(n: EvoNode): number {
    if (n.life === undefined) return 0;
    const oxygen = lifeOxygen(n.life);
    return oxygen.medium === 'water' ? oxygen.establish : 0;
  }

  /* ---------------------------------------------------------------- state -- */

  export interface DevRecord {
    readonly tick: number;
    readonly years: number;
    /** Developed by the version-4 save migration rather than in play. */
    readonly migrated?: boolean;
    /** Arose on its own, without the player spending evolution points. */
    readonly spontaneous?: boolean;
  }

  export type ChronicleKind = 'evolution' | 'milestone' | 'civ' | 'extinction' | 'info';

  export interface ChronicleEntry {
    /** Unique key; also what `reported` remembers. */
    readonly key: string;
    readonly kind: ChronicleKind;
    readonly nodeId?: string;
    readonly title: string;
    readonly text: string;
    readonly change: string;
    readonly icon: string;
    readonly tick: number;
    readonly years: number;
    readonly major: boolean;
    /** The step arose on its own (see EvolutionSystem.spontaneous). */
    readonly spontaneous?: boolean;
    /** Tile of the first founding population, for "show on the map". */
    readonly at?: number;
  }

  /** Everything about the tree that belongs in a save file. */
  export class EvolutionState {
    ep = 0;
    readonly developed = new Map<string, DevRecord>();
    /** Chronicle keys the player has already been shown. */
    readonly reported = new Set<string>();
    readonly chronicle: ChronicleEntry[] = [];
    /** Developed nodes currently without a living population (for notices). */
    readonly extinct = new Set<string>();
    /** Tick since which each undeveloped step has had all but its price. */
    readonly readySince = new Map<string, number>();

    reset(): void {
      this.ep = 0;
      this.developed.clear();
      this.reported.clear();
      this.chronicle.length = 0;
      this.extinct.clear();
      this.readySince.clear();
    }

    isDeveloped(id: string): boolean {
      return this.developed.has(id);
    }
  }

  /* ------------------------------------------------------------ conditions -- */

  export type CondKind = 'lineage' | 'atmosphere' | 'ocean' | 'habitat' | 'food' | 'partner' | 'soil' | 'cost';
  export type NodeState = 'locked' | 'partial' | 'available' | 'developed';

  export interface CondResult {
    readonly kind: CondKind;
    /** Full sentence for the detail panel. */
    readonly label: string;
    /** Short noun phrase for "Benötigt …" summaries. */
    readonly need: string;
    readonly met: boolean;
    /**
     * Not met only because it cannot be checked yet (the habitat search
     * waits for the ancestors and the oxygen). Shown, but not listed as
     * missing: it may well be fine.
     */
    readonly pending?: boolean;
    /** Live figure or hint, e.g. "jetzt 6,2 %". */
    readonly detail: string;
  }

  export interface NodeStatus {
    readonly state: NodeState;
    readonly conds: readonly CondResult[];
    /** Founding sites found for the habitat test. */
    readonly sites: number;
    /** Developed and currently alive on the planet. */
    readonly alive: boolean;
  }

  /**
   * A fixed permutation of every tile index (multiplicative stride, coprime
   * with TILE_COUNT), so searches with an early exit sample the whole planet
   * instead of its first rows.
   */
  function scatter(k: number): number {
    return (k * 7919) % TILE_COUNT;
  }

  /** Tiles a group must hold before it counts as established for others. */
  export const ECO_MIN_TILES = 24;
  /**
   * A step is founded at one spawn point: a centre tile and those of its
   * direct neighbours that suit the group too. Its founders start denser
   * than dispersal's, as a lone spawn has no second population to fall back on.
   */
  const SPAWN_CENTRE_DENSITY = 0.35;
  const SPAWN_EDGE_DENSITY = 0.25;
  const SPAWN_PLANT_COVER = 0.6;
  /** Room a founding site must leave a newcomer once the living groups have settled there (see settledRoom). */
  const SITE_MIN_ROOM = 0.1;
  /** Suitability a plant founding site needs. */
  const SITE_MIN_SUIT = 0.35;

  function fmtPct(v: number): string {
    return v.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  /**
   * The tree's rules. Stateless apart from a status cache; all persistent
   * state lives in `WorldState.evo`.
   */
  export class EvolutionSystem {
    private readonly status = new Map<string, NodeStatus>();
    private statusTick = -1;
    /** Bumped whenever statuses are recomputed, so views can skip redraws. */
    revision = 0;
    /** New chronicle entries waiting for the notifier. */
    readonly pending: ChronicleEntry[] = [];

    constructor(
      private readonly life: LifeSystem,
      private readonly flora: FloraSystem,
    ) {}

    /* ---- presence ---- */

    /** Tiles on which a node's group currently lives. */
    presence(world: WorldState, n: EvoNode): number {
      if (n.life !== undefined) return world.lifeCounts[n.life];
      if (n.flora !== undefined) return world.floraCounts[n.flora];
      return 0;
    }

    /** Is the node's group present on tile i? */
    private presentAt(world: WorldState, n: EvoNode, i: number): boolean {
      if (n.life !== undefined) return world.lifeDensity[i * LIFE_COUNT + n.life] > 0;
      if (n.flora !== undefined) return (world.flora[i] & (1 << n.flora)) !== 0;
      return false;
    }

    /** Present on tile i or any tile within `r` (Chebyshev, wrapping in X). */
    private presentNear(world: WorldState, n: EvoNode, i: number, r: number): boolean {
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= GRID_H) continue;
        for (let dx = -r; dx <= r; dx++) {
          if (this.presentAt(world, n, idx(wrapX(x + dx), yy))) return true;
        }
      }
      return false;
    }

    /* ---- founding sites ---- */

    /**
     * Tiles where a node could take hold right now, best first.
     *
     * This *is* the habitat condition: the tree says "available" exactly when
     * developing would found at least one population, so the two can never
     * disagree. A site has to lie next to the parent's range — a lineage
     * arises where its ancestors live, never on the far side of the planet.
     */
    foundingSites(world: WorldState, params: ModelParams, n: EvoNode, limit = 1500): number[] {
      const parent = n.parent ? evoNode(n.parent) : null;
      const out: number[] = [];
      const score: number[] = [];

      if (n.life !== undefined) {
        const c = n.life;
        const sea = LIFE[c].realm === 'sea';
        const parentSea = parent && parent.life !== undefined ? LIFE[parent.life].realm === 'sea' : sea;
        // Crossing between sea and land happens at the shore: look a little
        // further for the parent than within a realm.
        const radius = parent ? (parentSea !== sea ? 2 : 1) : 0;
        // A new lineage must hold its own against the settled community;
        // putting back one the tree already has (the v4 migration) only
        // needs room now.
        const settle = !world.evo.isDeveloped(n.id);
        this.life.prepare(world, params);
        // Visit the planet in a scattered order rather than row by row: with a
        // limit, a row-major scan only ever found sites in the far north, and
        // the first cells were all founded in one landlocked polar sea.
        for (let k = 0; k < TILE_COUNT && out.length < limit; k++) {
          const i = scatter(k);
          if (world.isWater(i) !== sea) continue;
          if (parent && !this.presentNear(world, parent, i, radius)) continue;
          const room = settle ? this.settledRoom(world, i, c) : this.life.roomFor(world, i, c);
          if (room < SITE_MIN_ROOM) continue;
          out.push(i);
          score.push(room);
        }
      } else if (n.flora !== undefined) {
        const g = n.flora;
        this.flora.prepare(world, params);
        const radius = parent && parent.life !== undefined ? 1 : 2;
        for (let k = 0; k < TILE_COUNT && out.length < limit; k++) {
          const i = scatter(k);
          if ((world.flora[i] & (1 << g)) !== 0) continue;
          const s = this.flora.suit(world, g, i);
          if (s < SITE_MIN_SUIT) continue;
          if (parent && !this.presentNear(world, parent, i, radius)) continue;
          out.push(i);
          score.push(s);
        }
      }

      const order = out.map((_, k) => k).sort((a, b) => score[b] - score[a]);
      return order.map((k) => out[k]);
    }

    /* ---- status ---- */

    /** Recompute every node's status, at most once per tick unless forced. */
    refresh(world: WorldState, params: ModelParams, force = false): void {
      if (!force && this.statusTick === world.ticks && this.status.size > 0) return;
      this.statusTick = world.ticks;
      for (const n of EVO_NODES) this.status.set(n.id, this.evaluate(world, params, n));
      this.revision++;
    }

    statusOf(id: string): NodeStatus {
      const s = this.status.get(id);
      if (!s) throw new Error(`SimEarth: no status for "${id}" — call refresh first`);
      return s;
    }

    /** Ids that can be developed this instant. */
    availableIds(): string[] {
      const out: string[] = [];
      for (const [id, s] of this.status) if (s.state === 'available') out.push(id);
      return out;
    }

    private evaluate(world: WorldState, params: ModelParams, n: EvoNode): NodeStatus {
      const evo = world.evo;
      const alive = this.presence(world, n) > 0;
      if (evo.isDeveloped(n.id)) {
        return { state: 'developed', conds: this.conditions(world, params, n, false).conds, sites: 0, alive };
      }
      const { conds, sites } = this.conditions(world, params, n, true);
      const lineage = conds.find((c) => c.kind === 'lineage');
      const parentDeveloped = !n.parent || evo.isDeveloped(n.parent);
      let state: NodeState;
      if (!parentDeveloped) state = 'locked';
      else if (conds.every((c) => c.met)) state = 'available';
      else state = 'partial';
      if (isDevMode()) state = 'available'; // DEVMODE: develop() still needs a founding site
      // A parent that was developed but has died out still leaves the node
      // visibly reachable: the condition says what to do about it.
      void lineage;
      return { state, conds, sites, alive };
    }

    /**
     * Every condition of a node, in display order. `withSites` runs the
     * founding-site search, which is the only expensive part.
     */
    conditions(
      world: WorldState, params: ModelParams, n: EvoNode, withSites: boolean,
    ): { conds: CondResult[]; sites: number } {
      const evo = world.evo;
      const conds: CondResult[] = [];

      // --- descent ---
      if (n.parent) {
        const p = evoNode(n.parent);
        const developed = evo.isDeveloped(p.id);
        const living = this.presence(world, p) > 0;
        conds.push({
          kind: 'lineage',
          label: `Abstammung: geht aus ${p.name} hervor`,
          need: p.name,
          met: developed && living,
          detail: !developed ? `${p.name} zuerst entwickeln`
            : !living ? `${p.name} sind ausgestorben – neu ansiedeln`
              : 'Vorfahren leben auf dem Planeten',
        });
      }

      // --- atmosphere ---
      const o2 = nodeO2(n);
      if (o2 > 0) {
        conds.push({
          kind: 'atmosphere',
          label: `Atmosphäre: mindestens ${fmtPct(o2)} % Sauerstoff`,
          need: `${fmtPct(o2)} % Sauerstoff`,
          met: world.o2 >= o2,
          detail: `jetzt ${fmtPct(world.o2)} %`,
        });
      }

      const oceanO2 = nodeOceanO2(n);
      if (oceanO2 > 0) {
        conds.push({
          kind: 'ocean',
          label: `Meer: mindestens ${fmtPct(oceanO2)} % der heutigen Sauerstoffsättigung`,
          need: `${fmtPct(oceanO2)} % Sauerstoffsättigung im Meer`,
          met: world.oceanO2 >= oceanO2,
          detail: `jetzt ${fmtPct(world.oceanO2)} % der heutigen Sättigung`,
        });
      }

      // --- ecology ---
      for (const need of n.eco) {
        const present = need.any.filter((id) => this.presence(world, evoNode(id)) >= ECO_MIN_TILES);
        const names = need.any.map((id) => evoNode(id).name);
        const list = names.length > 1
          ? `${names.slice(0, -1).join(', ')} oder ${names[names.length - 1]}` : names[0];
        conds.push({
          kind: need.kind,
          label: `${need.label}: ${list}`,
          need: list,
          met: present.length > 0,
          detail: present.length > 0
            ? `vorhanden: ${present.map((id) => evoNode(id).name).join(', ')}`
            : `noch nicht verbreitet (mind. ${ECO_MIN_TILES} Felder)`,
        });
      }

      // --- habitat ---
      let sites = 0;
      if (withSites) {
        const lineageOk = !n.parent || (evo.isDeveloped(n.parent) && this.presence(world, evoNode(n.parent)) > 0);
        const o2Ok = world.o2 >= o2 && world.oceanO2 >= oceanO2;
        if (lineageOk && o2Ok) sites = this.foundingSites(world, params, n, 60).length;
        const near = n.parent ? ` nahe ${evoNode(n.parent).name}` : '';
        conds.push({
          kind: 'habitat',
          label: `Lebensraum: ${n.habitat.text}`,
          need: 'einen geeigneten Lebensraum',
          met: sites > 0,
          pending: !lineageOk || !o2Ok,
          detail: !lineageOk ? 'wird geprüft, sobald die Vorfahren leben'
            : !o2Ok ? 'wird geprüft, sobald genug Sauerstoff da ist'
              : sites > 0 ? `${sites >= 60 ? 'viele' : sites} geeignete Orte${near}`
                : `kein geeigneter Ort${near} gefunden – ${n.parent ? `siedle ${evoNode(n.parent).name} in weiteren passenden Gebieten an oder warte, bis sich Klima und Pflanzen ändern` : 'warte auf ein günstigeres Klima'}`,
        });
      } else {
        conds.push({
          kind: 'habitat', label: `Lebensraum: ${n.habitat.text}`, need: 'einen geeigneten Lebensraum',
          met: true, detail: '',
        });
      }

      // --- price ---
      if (n.cost > 0 && evo.isDeveloped(n.id)) {
        conds.push({
          kind: 'cost', label: `Kosten: ${n.cost} Evolutionspunkte`, need: '', met: true, detail: 'bezahlt',
        });
      } else if (n.cost > 0) {
        conds.push({
          kind: 'cost',
          label: `Kosten: ${n.cost} Evolutionspunkte`,
          need: `${Math.ceil(n.cost - evo.ep)} weitere EP`,
          met: isDevMode() || evo.ep >= n.cost, // DEVMODE
          detail: `vorhanden: ${Math.floor(evo.ep)} EP`,
        });
      }

      return { conds, sites };
    }

    /** "Benötigt …" in one line, naming exactly what is missing. */
    static missingSummary(status: NodeStatus): string {
      const missing = status.conds.filter((c) => !c.met && !c.pending);
      if (missing.length === 0) return status.state === 'available' ? '' : 'Wird geprüft, sobald die übrigen Bedingungen erfüllt sind';
      const parts = missing.map((c) => c.need);
      const list = parts.length > 1
        ? `${parts.slice(0, -1).join(', ')} und ${parts[parts.length - 1]}` : parts[0];
      return `Benötigt ${list}`;
    }

    /* ---- acting ---- */

    /** Every condition but the price holds: the step only waits to be paid for. */
    static isReady(status: NodeStatus): boolean {
      // DEVMODE: the forced 'available' says nothing about nature; spontaneous steps keep the real conditions.
      if (isDevMode()) return status.conds.every((c) => c.met || c.kind === 'cost'); // DEVMODE
      return status.state === 'available' ||
        (status.state === 'partial' && status.conds.every((c) => c.met || c.kind === 'cost'));
    }

    /**
     * Develop a node. Re-checks everything synchronously and changes state in
     * the same call, so a double click can never charge twice or found twice.
     * A `spontaneous` step needs every condition but the price and costs
     * nothing — see `spontaneous()`.
     */
    develop(world: WorldState, params: ModelParams, id: string, how: 'chosen' | 'spontaneous' = 'chosen'): { ok: boolean; reason: string } {
      const n = EVO_BY_ID.get(id);
      if (!n) return { ok: false, reason: 'Unbekannter Entwicklungsschritt.' };
      const evo = world.evo;
      if (evo.isDeveloped(id)) return { ok: false, reason: `${n.name} ist bereits entwickelt.` };

      const status = this.evaluate(world, params, n);
      this.status.set(id, status);
      const spontaneous = how === 'spontaneous';
      if (spontaneous ? !EvolutionSystem.isReady(status) : status.state !== 'available') {
        return { ok: false, reason: EvolutionSystem.missingSummary(status) || 'Noch nicht verfügbar.' };
      }

      const sites = this.foundingSites(world, params, n);
      if (sites.length === 0) return { ok: false, reason: 'Kein geeigneter Lebensraum gefunden.' };

      if (!spontaneous && !isDevMode()) evo.ep -= n.cost; // DEVMODE
      evo.developed.set(id, { tick: world.ticks, years: world.absoluteYears, spontaneous: spontaneous || undefined });
      evo.extinct.delete(id);
      evo.readySince.delete(id);
      const founded = this.found(world, n, sites);
      world.refreshDerived();

      this.record(world, {
        key: `evo:${id}`, kind: 'evolution', nodeId: id,
        title: n.event.title, text: n.event.text, change: n.event.change,
        icon: evoIcon(id), tick: world.ticks, years: world.absoluteYears,
        major: !!n.event.major, spontaneous: spontaneous || undefined, at: founded[0],
      });

      this.refresh(world, params, true);
      return { ok: true, reason: '' };
    }

    /**
     * Let nature take a step the player has not. Tracks how long each step
     * has stood ready, then gives the longest-waiting ones a small chance
     * (spontaneousChance) to arise without evolution points. `roll(k)` is a
     * uniform number for the node at index k of EVO_NODES. At most one step
     * per call; returns its id.
     */
    spontaneous(world: WorldState, params: ModelParams, roll: (k: number) => number): string | null {
      const evo = world.evo;
      let winner: string | null = null;
      EVO_NODES.forEach((n, k) => {
        const s = this.status.get(n.id);
        if (evo.isDeveloped(n.id) || !s || !EvolutionSystem.isReady(s)) {
          evo.readySince.delete(n.id);
          return;
        }
        const since = evo.readySince.get(n.id);
        if (since === undefined) {
          evo.readySince.set(n.id, world.ticks);
          return;
        }
        const chance = spontaneousChance(world.ticks - since, params.bio.evolutionRate) * SPONTANEOUS_EVERY;
        if (!winner && roll(k) < chance) winner = n.id;
      });
      if (winner && this.develop(world, params, winner, 'spontaneous').ok) return winner;
      return null;
    }

    /**
     * Found the group at one spawn point — a new lineage arises in one place
     * and spreads from there. Of the sites (all next to the ancestors) in the
     * largest stretch of habitat, the one whose centre and suitable
     * neighbours offer the most room together wins; ties go to the planet's
     * rng. Returns the tiles, centre first.
     */
    private found(world: WorldState, n: EvoNode, sites: readonly number[]): number[] {
      let best = -Infinity;
      const ties: number[] = [];
      for (const i of this.inLargestHabitat(world, n, sites)) {
        let score = this.siteRoom(world, n, i);
        for (const j of this.spawnNeighbours(world, n, i)) score += this.siteRoom(world, n, j);
        if (score > best + 1e-9) {
          best = score;
          ties.length = 0;
        }
        if (score >= best - 1e-9) ties.push(i);
      }
      const centre = ties.length > 0 ? world.rng.pick(ties) : sites[0];
      const tiles = [centre, ...this.spawnNeighbours(world, n, centre)];

      tiles.forEach((i, k) => {
        if (n.life !== undefined) {
          const density = k === 0 ? SPAWN_CENTRE_DENSITY : SPAWN_EDGE_DENSITY;
          LifeSystem.seed(world, n.life, i % GRID_W, (i / GRID_W) | 0, density);
        } else if (n.flora !== undefined) {
          this.flora.plant(world, n.flora, i, SPAWN_PLANT_COVER);
        }
      });
      return tiles;
    }

    /**
     * Room tile i leaves class `c` once every living group that could live
     * there has moved in and grown as far as it can. Judged by the room of
     * the moment, spawns just ahead of an advancing range died out within a
     * few dozen ticks: that room was about to be taken back.
     */
    private settledRoom(world: WorldState, i: number, c: Life): number {
      // roomFor reads the tile from the world, so the settled densities are
      // swapped in for the one call and restored right after.
      const d = world.lifeDensity;
      const base = i * LIFE_COUNT;
      const now = d.slice(base, base + LIFE_COUNT);
      const settled = now.slice();
      for (let k = 1; k < LIFE_COUNT; k++) {
        if (k !== c && world.lifeCounts[k] > 0) settled[k] = Math.max(now[k], this.life.roomFor(world, i, k as Life));
      }
      d.set(settled, base);
      const room = this.life.roomFor(world, i, c);
      d.set(now, base);
      return room;
    }

    /** Room tile i leaves the node's group: settled room for animals, suitability for plants. */
    private siteRoom(world: WorldState, n: EvoNode, i: number): number {
      if (n.life !== undefined) return this.settledRoom(world, i, n.life);
      if (n.flora !== undefined) return this.flora.suit(world, n.flora, i);
      return 0;
    }

    /** Direct neighbours of a spawn centre where the group can take hold as well. */
    private spawnNeighbours(world: WorldState, n: EvoNode, i: number): number[] {
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      const out: number[] = [];
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const yy = y + dy;
        if (yy < 0 || yy >= GRID_H) continue;
        const j = idx(wrapX(x + dx), yy);
        if (n.life !== undefined) {
          if (world.isWater(j) !== (LIFE[n.life].realm === 'sea')) continue;
          if (this.settledRoom(world, j, n.life) < SITE_MIN_ROOM) continue;
        } else if (n.flora !== undefined) {
          if ((world.flora[j] & (1 << n.flora)) !== 0) continue;
          if (this.flora.suit(world, n.flora, j) < SITE_MIN_SUIT) continue;
        }
        out.push(j);
      }
      return out;
    }

    /**
     * The sites in the largest stretch of habitat any of them reaches: tiles
     * of the right realm, connected through neighbours, where the group could
     * settle. A lone spawn can only fill the stretch it starts in — first
     * cells founded in a closed inland sea stayed penned there for hundreds
     * of ticks.
     */
    private inLargestHabitat(world: WorldState, n: EvoNode, sites: readonly number[]): readonly number[] {
      const c = n.life;
      const g = n.flora;
      const habitable = (j: number): boolean => c !== undefined
        ? world.isWater(j) === (LIFE[c].realm === 'sea') && this.life.roomFor(world, j, c) >= LifeSystem.MIN_DENSITY * 2
        : g !== undefined && this.flora.problem(world, g, j) === null;
      const patch = new Int32Array(TILE_COUNT).fill(-1);
      const stack: number[] = [];
      let best = -1;
      let bestSize = 0;
      for (const s of sites) {
        if (patch[s] >= 0) continue;
        patch[s] = s;
        stack.push(s);
        let size = 0;
        while (stack.length > 0) {
          const i = stack.pop() as number;
          size++;
          const x = i % GRID_W;
          const y = (i / GRID_W) | 0;
          for (const j of [idx(wrapX(x - 1), y), idx(wrapX(x + 1), y), y > 0 ? i - GRID_W : -1, y < GRID_H - 1 ? i + GRID_W : -1]) {
            if (j < 0 || patch[j] >= 0 || !habitable(j)) continue;
            patch[j] = s;
            stack.push(j);
          }
        }
        if (size > bestSize) {
          bestSize = size;
          best = s;
        }
      }
      return sites.filter((i) => patch[i] === best);
    }

    /** Add a chronicle entry and queue it for display. */
    record(world: WorldState, entry: ChronicleEntry): void {
      const evo = world.evo;
      if (evo.chronicle.some((e) => e.key === entry.key)) return;
      evo.chronicle.push(entry);
      this.pending.push(entry);
    }

    /* ---- per tick ---- */

    /** How many developed groups are alive — the planet's diversity. */
    diversity(world: WorldState): number {
      let d = 0;
      for (const id of world.evo.developed.keys()) {
        if (this.presence(world, evoNode(id)) > 0) d++;
      }
      return d;
    }

    /** Evolution points earned per tick at the current diversity. */
    epRate(world: WorldState, params: ModelParams): number {
      const d = this.diversity(world);
      if (d === 0) return 0;
      return mul(params.bio.evolutionRate) * (EP_BASE + EP_PER_GROUP * d);
    }

    step(world: WorldState, params: ModelParams): void {
      const evo = world.evo;
      evo.ep = Math.min(EP_MAX, evo.ep + this.epRate(world, params));

      // Extinctions are worth a quiet notice — and they are the one way a
      // path can look blocked, so the chronicle says how to undo it.
      if (world.ticks % 8 === 0) {
        for (const id of evo.developed.keys()) {
          const n = evoNode(id);
          const alive = this.presence(world, n) > 0;
          if (!alive && !evo.extinct.has(id)) {
            evo.extinct.add(id);
            this.record(world, {
              key: `extinct:${id}:${world.ticks}`, kind: 'extinction', nodeId: id,
              title: `${n.name} ausgestorben`,
              text: 'Auf dem ganzen Planeten lebt keine Population mehr.',
              change: n.life !== undefined
                ? 'Du kannst sie mit „Leben ansiedeln“ an einem geeigneten Ort neu ansiedeln.'
                : 'Du kannst sie mit dem Werkzeug „Pflanzen“ an einem geeigneten Ort neu ansiedeln.',
              icon: 'assets/events/extinction.svg', tick: world.ticks, years: world.absoluteYears,
              major: false,
            });
          } else if (alive && evo.extinct.has(id)) {
            evo.extinct.delete(id);
          }
        }
      }

      for (const e of oxygenMilestones(world)) this.record(world, e);
      for (const e of lycopsidMilestones(world)) this.record(world, e);
      for (const e of cactusMilestones(world)) this.record(world, e);

      // Statuses are cheap to read and moderately costly to build: rebuild a
      // few times a second of fast play, and on demand after any action.
      if (world.ticks % SPONTANEOUS_EVERY === 0) {
        this.refresh(world, params, true);
        this.spontaneous(world, params, (k) => spontaneousRoll(world.seed, world.ticks, k));
      }
    }
  }

  /** EP per tick with a single living group. */
  export const EP_BASE = 0.05;
  /** EP per tick added by each further living group. */
  export const EP_PER_GROUP = 0.025;
}
