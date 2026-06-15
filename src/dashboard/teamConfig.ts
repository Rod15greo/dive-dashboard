/**
 * @deprecated Use src/memberConfig.ts + data/members.json instead.
 * This file is kept for compatibility with the dashboard collectors.
 */
export interface TeamMember {
  id: string;
  name: string;
  role: string;
  technical: boolean;  // false = não faz commits (design, validação, coordenação)
  github: string | string[];
  email: string | string[] | null;
  discordIds: string[];
  firefliesNames: string[];
}

export const TEAM: TeamMember[] = [
  {
    id: 'laianny',
    name: 'Laianny',
    role: 'Design/UX',
    technical: false,
    github: 'laianny-design',
    email: 'laiannycontact@gmail.com',
    discordIds: ['1495553391638614176'],
    firefliesNames: ['Laianny', 'Laianny da Silva Medeiros'],
  },
  {
    id: 'andrem',
    name: 'Andrem Mohr',
    role: 'Validação e Clientes',
    technical: false,
    github: 'mohrandrem-hue',
    email: ['mohr.andrem@gmail.com', 'andre@vant.ia.br'],
    discordIds: ['1374792947413024768'],
    firefliesNames: ['Andrem', 'Andrem Mohr', 'Andre Mohr', 'André Mohr'],
  },
  {
    id: 'rafaela',
    name: 'Rafaela',
    role: 'Validação',
    technical: false,
    github: 'RafaelaCcyber',
    email: 'rafaelafrade9@gmail.com',
    discordIds: ['1460737539056074839'],
    firefliesNames: ['Rafaela', 'Rafaela Frade'],
  },
  {
    id: 'bianca',
    name: 'Bianca Miranda',
    role: 'Unity',
    technical: true,
    github: 'Bianca-Mirtes',
    email: 'miranda.bianca41@gmail.com',
    discordIds: ['846568059807334430', '1468042974582804545'],
    firefliesNames: ['Bianca', 'Bianca Miranda'],
  },
  {
    id: 'math',
    name: 'Math',
    role: 'Unity',
    technical: true,
    github: 'Math-Maths',
    email: 'mathegodoy29@gmail.com',
    discordIds: ['281545730181562368'],
    firefliesNames: ['Math', 'Matheus', 'Matheus Pereira'],
  },
  {
    id: 'tejota',
    name: 'TeJota',
    role: 'Design/UX',
    technical: false,
    github: 'TeJota1337',
    email: 'tjddsouza@gmail.com',
    discordIds: ['276604113326702593'],
    firefliesNames: ['TeJota', 'TJ', 'Tiago Souza'],
  },
  {
    id: 'stefane',
    name: 'Stefane',
    role: 'Core/Mirror',
    technical: true,
    github: 'StefWolf',
    email: 'stefaneassisori@gmail.com',
    discordIds: ['183401090233008130'],
    firefliesNames: ['Stefane', 'Stefane Orichuela'],
  },
  {
    id: 'joao_vitor',
    name: 'João Vitor',
    role: 'Unity',
    technical: true,
    github: ['Joao-v-dive', 'ZirconGames'],
    email: 'jvferreira@diverealities.com',
    discordIds: ['414572528527212555'],
    firefliesNames: ['João Vitor', 'Joao Vitor', 'João Vitor Ferreira', 'Zircon', 'ZirconGames'],
  },
  {
    id: 'gabriel',
    name: 'Gabriel Marques',
    role: 'Infra',
    technical: true,
    github: 'Perkhad',
    email: 'gabrieldamatamarques@gmail.com',
    discordIds: ['212315753930686464'],
    firefliesNames: ['Gabriel', 'Gabriel Marques', 'Gabriel da Mata Marques'],
  },
  {
    id: 'rodrigo',
    name: 'Rodrigo',
    role: 'Coordenação',
    technical: false,
    github: 'Rod15greo',
    email: 'rodcar150102@gmail.com',
    discordIds: ['744276929045201066', '1493975702792437962'],
    firefliesNames: ['Rodrigo', 'Rodrigo Mendes'],
  },
  {
    id: 'pedro',
    name: 'Pedro Costa',
    role: 'Tech Art',
    technical: true,
    github: 'Pedrogcosta',
    email: ['pedro.an.gcosta@gmail.com', 'pedro.an.gcosta@hotmail.com'],
    discordIds: ['513842918721585173'],
    firefliesNames: ['Pedro', 'Pedro Costa', 'Pedro Antonio'],
  },
  {
    id: 'rafael',
    name: 'Rafael Meneguzzo',
    role: 'Tech Art',
    technical: true,
    github: 'rafael-meneguzzo',
    email: 'meneguzzo.contato@gmail.com',
    discordIds: ['270369119684132864'],
    firefliesNames: ['Rafael', 'Rafael Meneguzzo'],
  },
  {
    id: 'yago',
    name: 'Yago Andrade',
    role: 'Core',
    technical: true,
    github: 'yagoandrade',
    email: ['ayav@ic.ufal.br', 'contact@yagoandrade.com'],
    discordIds: ['206250874610122755'],
    firefliesNames: ['Yago', 'Yago Andrade'],
  },
  {
    id: 'nicolas',
    name: 'Nicolas Costa',
    role: 'Infra',
    technical: true,
    github: ['nickolas52468', 'nicolascosta-dive'],
    email: 'nicolascosta@diverealities.com',
    discordIds: ['268449116709847040', '769183584003031100'],
    firefliesNames: ['Nicolas', 'Nicolas Costa'],
  },
  {
    id: 'anders',
    name: 'Anders',
    role: 'Liderança',
    technical: false,
    github: 'andersdive',
    email: 'anders@diverealities.com',
    discordIds: ['993487265596711012'],
    firefliesNames: ['Anders', 'Anders Rinaldi'],
  },
  {
    id: 'sergio',
    name: 'Sergio Filho',
    role: 'Web/Infra',
    technical: true,
    github: 'oSergioFilho',
    email: 'sergiofilho0609@gmail.com',
    discordIds: ['374966272250871820'],
    firefliesNames: ['Sergio', 'Sergio Filho', 'Sergio Jose de Almeida'],
  },
  {
    id: 'mia',
    name: 'Mia Saiki',
    role: 'Coordenação',
    technical: false,
    github: '',
    email: 'mia@diverealities.com',
    discordIds: ['432716644301930499'],
    firefliesNames: ['Mia', 'Mia Saiki'],
  },
  {
    id: 'luiz',
    name: 'Luiz Eduardo',
    role: 'Unity',
    technical: true,
    github: 'luisesales',
    email: ['duduosales@hotmail.com', 'luisedeosales@gmail.com'],
    discordIds: [],
    firefliesNames: ['Luiz', 'Luiz Eduardo'],
  },
  {
    id: 'augusto',
    name: 'Augusto Wiegand',
    role: 'Branding Externo',
    technical: false,
    github: 'wiegandstd',
    email: 'hello@wiegandstd.com',
    discordIds: ['304758823782973453', '1474211654328778752'],
    firefliesNames: ['Augusto', 'Augusto Wiegand', 'Wiegand'],
  },
];

export function findByGithub(login: string): TeamMember | undefined {
  const lower = login.toLowerCase();
  return TEAM.find(m => {
    if (!m.github || (Array.isArray(m.github) && m.github.length === 0)) return false;
    return Array.isArray(m.github)
      ? m.github.some(g => g.toLowerCase() === lower)
      : m.github.toLowerCase() === lower;
  });
}

export function findByEmail(email: string): TeamMember | undefined {
  const lower = email.toLowerCase();
  return TEAM.find(m => {
    if (!m.email) return false;
    return Array.isArray(m.email)
      ? m.email.some(e => e.toLowerCase() === lower)
      : m.email.toLowerCase() === lower;
  });
}

export function findByDiscordId(id: string): TeamMember | undefined {
  return TEAM.find(m => m.discordIds.includes(id));
}

export function findByFirefliesName(name: string): TeamMember | undefined {
  const lower = name.toLowerCase().trim();
  return TEAM.find(m =>
    m.firefliesNames.some(fn => fn.toLowerCase() === lower)
  );
}
