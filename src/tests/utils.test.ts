import { describe, it, expect } from 'vitest';
import { cn } from '$lib/utils';

describe('Utils', () => {
  describe('cn (classname merger)', () => {
    it('should merge class names', () => {
      expect(cn('class1', 'class2')).toBe('class1 class2');
    });

    it('should handle conditional classes', () => {
      expect(cn('class1', true && 'class2', false && 'class3')).toBe('class1 class2');
    });

    it('should result in tailwind merge behavior', () => {
      // tailwind-merge should resolve conflicts
      expect(cn('p-4 p-2')).toBe('p-2');
      expect(cn('bg-red-500 bg-blue-500')).toBe('bg-blue-500');
    });

    it('should handle arrays and objects', () => {
      expect(cn(['class1', 'class2'])).toBe('class1 class2');
      expect(cn({ 'class1': true, 'class2': false })).toBe('class1');
    });
  });
});
