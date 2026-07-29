import type { TemplateId } from './types';

export interface GalleryTemplate {
  id: TemplateId; index: string; name: string; label: string; description: string;
  dimensions: [number, number]; accent: string; camera: [number, number, number];
}

export const TEMPLATES: GalleryTemplate[] = [
  { id: 'white-cube', index: '01', name: 'The White Cube', label: 'Quiet · Versatile', description: 'A luminous, balanced room for collections of any scale.', dimensions: [11, 8], accent: '#d9d7ce', camera: [0, 3.1, 8.8] },
  { id: 'nocturne', index: '02', name: 'Nocturne', label: 'Intimate · Dramatic', description: 'Dark mineral surfaces and focused pools of museum light.', dimensions: [10, 7], accent: '#282925', camera: [0, 2.8, 8] },
  { id: 'pavilion', index: '03', name: 'The Pavilion', label: 'Open · Architectural', description: 'A generous salon with a sculptural central sightline.', dimensions: [13, 9], accent: '#beb39e', camera: [0, 3.5, 10] }
];

export const getTemplate = (id: TemplateId) => TEMPLATES.find((item) => item.id === id) ?? TEMPLATES[0];
