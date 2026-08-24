import { createMutation } from "@tanstack/svelte-query";
import { apiRequest } from "./client";

interface UploadResult {
	success: boolean;
	image?: string;
	logo?: string;
}

function uploadImage(path: string, file: File, organizationId?: string): Promise<UploadResult> {
	const formData = new FormData();
	formData.append("file", file);
	if (organizationId) {
		formData.append("organizationId", organizationId);
	}
	return apiRequest(path, "Image upload failed", { method: "POST", body: formData });
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
