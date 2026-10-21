// The shop's old Cloudinary account was disabled, so anything still pointing at it can never load. Customer-facing
// code drops such pictures (the admin keeps them, so they can be replaced) instead of showing a broken image.
const DEAD_HOSTS = /^https?:\/\/(?:[a-z0-9-]+\.)*cloudinary\.com\//i;

export function isDeadImageUrl(url: string | null | undefined): boolean {
  return !!url && DEAD_HOSTS.test(url.trim());
}
