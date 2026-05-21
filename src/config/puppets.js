export const PUPPETS = [
  {
    id: 1,
    role: "Melodia",
    channel: 1,
    color: "#f56f5c",
    pads: [
      { label: "C", notes: [60, 64, 67] },
      { label: "Dm", notes: [62, 65, 69] },
      { label: "Em", notes: [64, 67, 71] },
      { label: "F", notes: [65, 69, 72] },
      { label: "G", notes: [67, 71, 74] }
    ]
  },
  {
    id: 2,
    role: "Bajo",
    channel: 2,
    color: "#40b3a2",
    pads: [
      { label: "C", notes: [36, 40, 43] },
      { label: "Dm", notes: [38, 41, 45] },
      { label: "Em", notes: [40, 43, 47] },
      { label: "F", notes: [41, 45, 48] },
      { label: "G", notes: [43, 47, 50] }
    ]
  },
  {
    id: 3,
    role: "Percusion",
    channel: 3,
    color: "#f2bf4b",
    pads: [
      { label: "C", notes: [60, 64, 67] },
      { label: "Dm", notes: [62, 65, 69] },
      { label: "Em", notes: [64, 67, 71] },
      { label: "F", notes: [65, 69, 72] },
      { label: "G", notes: [67, 71, 74] }
    ]
  },
  {
    id: 4,
    role: "Textura",
    channel: 4,
    color: "#7a8ff0",
    pads: [
      { label: "C", notes: [48, 55, 60] },
      { label: "Dm", notes: [50, 57, 62] },
      { label: "Em", notes: [52, 59, 64] },
      { label: "F", notes: [53, 60, 65] },
      { label: "G", notes: [55, 62, 67] }
    ]
  },
  {
    id: 5,
    role: "Acompanamiento",
    channel: 5,
    color: "#d97fe7",
    pads: [
      { label: "C", notes: [60, 64, 67] },
      { label: "Dm", notes: [62, 65, 69] },
      { label: "Em", notes: [64, 67, 71] },
      { label: "F", notes: [65, 69, 72] },
      { label: "G", notes: [67, 71, 74] }
    ]
  }
];

export const PUPPET_BY_ID = new Map(PUPPETS.map((puppet) => [puppet.id, puppet]));
