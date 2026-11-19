export interface ExperienceItem {
  role: string;
  organization: string;
  location: string;
  period: string;
  highlights: string[];
}

export interface EducationItem {
  degree: string;
  institution: string;
  location: string;
  period: string;
  note?: string;
}

export const STARTER_PROMPTS = [
  {
    lang: 'EN',
    label: 'Tell me about Lily’s work at Stila Cosmetics',
    prompt: 'Tell me about Lily’s experience and results at Stila Cosmetics.',
  },
  {
    lang: 'FR',
    label: 'Parle-moi de sa recherche d’alternance',
    prompt: 'Parle-moi de Lily et du contrat d’alternance qu’elle recherche à Paris.',
  },
  {
    lang: 'EN',
    label: 'What did she study at Emory University?',
    prompt: 'What did Lily study at Emory University and what was her GPA?',
  },
  {
    lang: 'FR',
    label: 'Quelles sont ses compétences clés ?',
    prompt: 'Quelles sont les compétences principales de Lily en communication et stratégie ?',
  },
];

export const KEY_METRICS = [
  { value: '2M+', label: 'Instagram views at Stila Cosmetics' },
  { value: '+111%', label: 'Engagement growth vs. pre-internship' },
  { value: '3.9 / 4.0', label: 'Summa Cum Laude, Emory University' },
  { value: '2w / 1w', label: 'Paris alternance rhythm (EN & FR)' },
];

export const EXPERIENCE: ExperienceItem[] = [
  {
    role: 'Content Creator & Social Media Marketing Intern',
    organization: 'Stila Cosmetics',
    location: 'New York, NY',
    period: '2024 – 2026',
    highlights: [
      'Developed Instagram posts generating 2M views, increasing engagement by 111% compared to pre-internship metrics.',
      'Created the 2nd-highest-performing TikTok ad in company history.',
      'Directed a social media content shoot, including model casting and video editing.',
      'Conducted and presented monthly social media analysis to the CMO and marketing team.',
    ],
  },
  {
    role: 'Director of Event Operations',
    organization: 'AltKey Sustainable Fashion Organization',
    location: 'Atlanta, GA',
    period: '2022 – 2025',
    highlights: [
      'Produced and choreographed a sustainable fashion show featuring 15 models and 100+ attendees.',
      'Recruited and coordinated independent designers, judges, and models.',
      'Created informational social media graphics and videos, and organized pop-up thrift shops and upcycling workshops.',
    ],
  },
  {
    role: 'Intern Coordinator & Executive Assistant',
    organization: 'Repurpose',
    location: 'New York, NY',
    period: 'Summer 2023',
    highlights: [
      'Led a team of 15 interns, delegating tasks and ensuring timely, high-standard project delivery.',
      'Oversaw donation intake operations from item selection and price research to Shopify management.',
      'Coordinated visual merchandising and marketing initiatives aligned with brand standards, acting as primary contact for business partners.',
    ],
  },
  {
    role: 'Store Manager & Product Developer',
    organization: 'Eden Pond Swim + Leisure',
    location: 'Concord, MA',
    period: '2020 – 2021',
    highlights: [
      'Developed product designs in collaboration with an international artist and implemented an inventory system.',
      'Led personal styling appointments for customers of all ages, selling over $25,000 in merchandise.',
    ],
  },
];

export const EDUCATION: EducationItem[] = [
  {
    degree: 'M1: Luxury Communication & Media Strategy',
    institution: 'Sup de Pub',
    location: 'Paris, France',
    period: '2026 – 2028',
    note: 'Seeking a 2-week enterprise / 1-week school alternance contract.',
  },
  {
    degree: 'B.A. Interdisciplinary Studies: Sustainable Fashion & Culture',
    institution: 'Emory University',
    location: 'Atlanta, USA',
    period: '2022 – 2025',
    note: 'Summa Cum Laude · 3.9/4.0 GPA · Marketing, Sustainable Fashion & Dance.',
  },
];

export const CAPABILITIES = [
  {
    group: 'Strategy & Direction',
    items: 'Strategy & branding · Social analytics · Creative direction · Social media content creation · Customer service & sales',
  },
  {
    group: 'Platforms & Tools',
    items: 'Meta · TikTok · YouTube · X · Pinterest · LinkedIn · Canva · CapCut · Shopify · Klaviyo · ChatGPT · Gemini · Claude',
  },
  {
    group: 'Languages',
    items: 'English (Native) · French (B2)',
  },
  {
    group: 'Personal Interests',
    items: 'Dance · Guitar · Sustainability · Football · Art, crafting & creativity',
  },
];
