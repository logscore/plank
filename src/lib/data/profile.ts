import { createMutation } from "@tanstack/svelte-query";
import { uploadInChunks } from "./client";

function uploadImage(path: string, file: File, organizationId?: string): Promise<void> {
	return uploadInChunks(path, file, "Image upload failed", undefined, organizationId ? { organizationId } : {});
}

export function createUploadAvatarMutation() {
	return createMutation<void, Error, File>(() => ({
		mutationFn: (file) => uploadImage("/api/upload/avatar", file),
	}));
}

export function createUploadOrganizationLogoMutation() {
	return createMutation<void, Error, { organizationId: string; file: File }>(() => ({
		mutationFn: ({ organizationId, file }) => uploadImage("/api/upload/logo", file, organizationId),
	}));
}
