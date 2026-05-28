export const INSTRUMENTS = [
  {
    id: "pulse",
    label: "Pulso",
    channel: 1,
    color: "#f56f5c",
    notes: [60, 62, 64, 67, 69]
  },
  {
    id: "bass",
    label: "Bajo",
    channel: 2,
    color: "#40b3a2",
    notes: [36, 43, 45, 48, 55]
  },
  {
    id: "spark",
    label: "Chispa",
    channel: 3,
    color: "#f2bf4b",
    notes: [60, 64, 67, 71, 74]
  },
  {
    id: "texture",
    label: "Textura",
    channel: 4,
    color: "#7a8ff0",
    notes: [48, 55, 60, 64, 67]
  },
  {
    id: "harmony",
    label: "Armonia",
    channel: 5,
    color: "#d97fe7",
    notes: [52, 55, 59, 62, 67]
  }
];

export const INSTRUMENT_BY_ID = new Map(INSTRUMENTS.map((instrument) => [instrument.id, instrument]));

export function assignNote(instrument, seed) {
  return instrument.notes[seed % instrument.notes.length];
}
