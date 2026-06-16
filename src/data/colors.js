export const COLORS = [
  { id: 'c01', name: '白',   hex: '#F8F8F8' },
  { id: 'c02', name: '粉',   hex: '#FFB7C5' },
  { id: 'c03', name: '红',   hex: '#E63946' },
  { id: 'c04', name: '橙',   hex: '#F4A261' },
  { id: 'c05', name: '黄',   hex: '#F7D060' },
  { id: 'c06', name: '黄绿', hex: '#B5DE6D' },
  { id: 'c07', name: '绿',   hex: '#5AB35A' },
  { id: 'c08', name: '薄荷', hex: '#8FD3C7' },
  { id: 'c09', name: '青',   hex: '#5FCAD9' },
  { id: 'c10', name: '天蓝', hex: '#7EC0EE' },
  { id: 'c11', name: '蓝',   hex: '#4A6FE3' },
  { id: 'c12', name: '紫',   hex: '#A06CD5' },
  { id: 'c13', name: '品红', hex: '#D854A2' },
  { id: 'c14', name: '棕',   hex: '#A0744A' },
  { id: 'c15', name: '灰',   hex: '#9AA0A6' },
  { id: 'c16', name: '黑',   hex: '#2B2B2B' },
];

export function colorById(id) {
  return COLORS.find(c => c.id === id);
}
