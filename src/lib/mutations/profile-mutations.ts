import { createMutation } from "@tanstack/svelte-query";

interface UploadResult {
	success: boolean;
	image?: string;
	logo?: string;
}

async function uploadImage(path: string, file: File, organizationId?: string): Promise<UploadResult> {
	const formData = new FormData();
	formData.append("file", file);
	if (organizationId) {
		formData.append("organizationId", organizationId);
	}

	const response = await fetch(path, { method: "POST", body: formData });
	const result = (await response.json().catch(() => null)) as
		| (UploadResult & { error?: string; message?: string })
		| null;
	if (!response.ok) {
		throw new Error(result?.message || result?.error || "Image upload failed");
	}
	return result ?? { success: true };
}

export function createUploadAvatarMutation() {
	return createMutation<UploadResult, Error, File>(() => ({
		mutationFn: (file) => uploadImage("/api/upload/avatar", file),
	}));
}

export function createUploadOrganizationLogoMutation() {
	return createMutation<UploadResult, Error, { organizationId: string; file: File }>(() => ({
		mutationFn: ({ organizationId, file }) => uploadImage("/api/upload/logo", file, organizationId),
	}));
}
