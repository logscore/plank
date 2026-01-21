import { describe, expect, it } from 'vitest';
import { cn } from '$lib/utils';

describe('Utils', () => {
	describe('cn (classname merger)', () => {
		it('should merge class names', () => {
			expect(cn('class1', 'class2')).toBe('class1 class2');
		});

		it('should handle conditional classes', () => {
			expect(cn('class1', 'class2', false)).toBe('class1 class2');
		});

		it('should result in tailwind merge behavior', () => {
			// tailwind-merge should resolve conflicts (keeps last class)
			expect(cn('p-2 p-4')).toBe('p-4');
			expect(cn('bg-blue-500 bg-red-500')).toBe('bg-red-500');
		});

		it('should handle arrays and objects', () => {
			expect(cn(['class1', 'class2'])).toBe('class1 class2');
			expect(cn({ class1: true, class2: false })).toBe('class1');
		});
	});
});
