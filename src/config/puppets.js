export const PUPPETS = [
  {
    id: 1,
    role: "Melodia",
    channel: 1,
    color: "#f56f5c",
    notes: [60, 62, 64, 67, 69]
  },
  {
    id: 2,
    role: "Bajo",
    channel: 2,
    color: "#40b3a2",
    notes: [36, 38, 40, 43, 45]
  },
  {
    id: 3,
    role: "Percusion",
    channel: 3,
    color: "#f2bf4b",
    notes: [60, 62, 64, 67, 69]
  },
  {
    id: 4,
    role: "Textura",
    channel: 4,
    color: "#7a8ff0",
    notes: [48, 55, 60, 62, 67]
  },
  {
    id: 5,
    role: "Acompanamiento",
    channel: 5,
    color: "#d97fe7",
    notes: [52, 55, 59, 62, 67]
  }
];

export const PUPPET_BY_ID = new Map(PUPPETS.map((puppet) => [puppet.id, puppet]));
