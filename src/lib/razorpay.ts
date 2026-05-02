const RAZORPAY_SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

let scriptLoaded = false;

export function loadRazorpayScript(): Promise<void> {
  if (scriptLoaded) return Promise.resolve();
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(
      `script[src="${RAZORPAY_SCRIPT_URL}"]`
    );
    if (existing) {
      scriptLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      scriptLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load Razorpay SDK"));
    document.body.appendChild(script);
  });
}

interface OpenCheckoutParams {
  keyId: string;
  orderId: string;
  amount: number;
  currency?: string;
  patientName?: string;
  patientEmail?: string;
  patientPhone?: string;
  description?: string;
  onSuccess: (response: RazorpaySuccessResponse) => void;
  onDismiss?: () => void;
}

export async function openRazorpayCheckout({
  keyId,
  orderId,
  amount,
  currency = "INR",
  patientName,
  patientEmail,
  patientPhone,
  description = "Consultation Fee",
  onSuccess,
  onDismiss,
}: OpenCheckoutParams): Promise<void> {
  await loadRazorpayScript();
  if (!keyId) throw new Error("Razorpay key not configured");

  const rzp = new window.Razorpay({
    key: keyId,
    amount,
    currency,
    name: "hpHomeo",
    description,
    order_id: orderId,
    prefill: {
      name: patientName,
      email: patientEmail,
      contact: patientPhone,
    },
    theme: { color: "#2D6A4F" },
    handler: onSuccess,
    modal: {
      ondismiss: onDismiss,
      confirm_close: true,
    },
  });

  rzp.open();
}
