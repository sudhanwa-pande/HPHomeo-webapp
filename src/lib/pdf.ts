import api from "./api";

/**
 * Fetches a PDF as a Blob using the authenticated API instance
 * and opens it in a new tab. This bypasses iframe SAMEORIGIN/CSP issues.
 */
export const fetchAndOpenPdf = async (url: string) => {
  try {
    const response = await api.get(url, { responseType: "blob" });
    const blob = new Blob([response.data], { type: "application/pdf" });
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, "_blank");
    
    // Clean up the URL after a short delay
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
  } catch (error) {
    console.error("Could not open PDF:", error);
    throw error;
  }
};

/**
 * Directly opens a Blob as a PDF in a new tab.
 */
export const openPdfBlob = (blob: Blob) => {
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, "_blank");
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
};
