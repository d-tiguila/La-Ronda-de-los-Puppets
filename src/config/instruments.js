export const INSTRUMENTS = [
  {
    id: "pulse",
    label: "Pulso",
    channel: 1,
    color: "#f56f5c",
    chords: [
      { id: "c", label: "C", notes: [60, 64, 67] },
      { id: "dm", label: "Dm", notes: [62, 65, 69] },
      { id: "em", label: "Em", notes: [64, 67, 71] },
      { id: "f", label: "F", notes: [65, 69, 72] },
      { id: "g", label: "G", notes: [67, 71, 74] }
    ]
  },
  {
    id: "bass",
    label: "Bajo",
    channel: 2,
    color: "#40b3a2",
    chords: [
      { id: "c", label: "C", notes: [36, 40, 43] },
      { id: "dm", label: "Dm", notes: [38, 41, 45] },
      { id: "em", label: "Em", notes: [40, 43, 47] },
      { id: "f", label: "F", notes: [41, 45, 48] },
      { id: "g", label: "G", notes: [43, 47, 50] }
    ]
  },
  {
    id: "spark",
    label: "Chispa",
    channel: 3,
    color: "#f2bf4b",
    chords: [
      { id: "c", label: "C", notes: [72, 76, 79] },
      { id: "dm", label: "Dm", notes: [74, 77, 81] },
      { id: "em", label: "Em", notes: [76, 79, 83] },
      { id: "f", label: "F", notes: [77, 81, 84] },
      { id: "g", label: "G", notes: [79, 83, 86] }
    ]
  },
  {
    id: "texture",
    label: "Textura",
    channel: 4,
    color: "#7a8ff0",
    chords: [
      { id: "c", label: "C", notes: [48, 55, 60] },
      { id: "dm", label: "Dm", notes: [50, 57, 62] },
      { id: "em", label: "Em", notes: [52, 59, 64] },
      { id: "f", label: "F", notes: [53, 60, 65] },
      { id: "g", label: "G", notes: [55, 62, 67] }
    ]
  },
  {
    id: "harmony",
    label: "Armonia",
    channel: 5,
    color: "#d97fe7",
    chords: [
      { id: "c", label: "C", notes: [60, 64, 67] },
      { id: "dm", label: "Dm", notes: [62, 65, 69] },
      { id: "em", label: "Em", notes: [64, 67, 71] },
      { id: "f", label: "F", notes: [65, 69, 72] },
      { id: "g", label: "G", notes: [67, 71, 74] }
    ]
  }
];

export const INSTRUMENT_BY_ID = new Map(INSTRUMENTS.map((instrument) => [instrument.id, instrument]));

export function findChord(instrument, chordId) {
  return instrument.chords.find((chord) => chord.id === chordId) ?? instrument.chords[0];
}
