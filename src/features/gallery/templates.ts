import type { TemplateId } from './types';

export interface GalleryTemplate {
  id: TemplateId; index: string; name: string; label: string; description: string;
  dimensions: [number, number]; height: number; dividerWidth?: number; accent: string; camera: [number, number, number];
}

export const TEMPLATES: GalleryTemplate[] = [
  { id: 'white-cube', index: '01', name: 'The White Cube', label: 'Luminous · Minimal', description: 'A generous daylight hall with clean reveals and a calm, uninterrupted exhibition axis.', dimensions: [16, 12], height: 5.3, accent: '#d9d7ce', camera: [0, 3.9, 14.2] },
  { id: 'nocturne', index: '02', name: 'Nocturne', label: 'Intimate · Dramatic', description: 'A taller cinematic chamber with angled wings, a sculptural stage, and concentrated pools of light.', dimensions: [15.5, 11.5], height: 5.8, accent: '#282925', camera: [0, 4.05, 13.8] },
  { id: 'pavilion', index: '03', name: 'The Grand Pavilion', label: 'Twin Salon · Monumental', description: 'A flagship two-room exhibition linked by bronze portals, luminous ceiling courts, a reflecting oculus, and monumental sightlines.', dimensions: [30, 22], height: 7.2, dividerWidth: 18, accent: '#aa9372', camera: [0, 6.2, 27.5] }
];

export const getTemplate = (id: TemplateId) => TEMPLATES.find((item) => item.id === id) ?? TEMPLATES[0];
