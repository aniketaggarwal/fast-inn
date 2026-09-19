import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

// Purely a UX prompt — the backend never checks which gesture actually
// happened (see issuer/src/pipeline/liveness.js), only that a face was
// present throughout and the frames actually differ. Showing a random
// prompt still matters: it's what gets a live person to move at all,
// which is the thing being checked.
const PROMPTS = ["Blink twice", "Turn your head left, then right", "Smile", "Nod your head"];
const FRAME_COUNT = 6;
const FRAME_INTERVAL_MS = 450;
const COUNTDOWN_SECONDS = 3;

const FAILURE_MESSAGES = {
  face_not_detected: "We couldn't see a face clearly in every frame — make sure your face is centered and well-lit.",
  multiple_faces: "More than one face was detected — make sure you're alone in frame.",
  no_motion_detected: "That looked too still — please follow the prompt and move naturally, not just hold a photo up.",
  insufficient_frames: "Capture was interrupted — please try again.",
  too_many_frames: "Something went wrong with the capture — please try again.",
};

// idle -> starting -> ready -> counting down -> capturing -> checking -> done
//                        ^______________________________________|  (on failure, back to ready)
export function LivenessCapture({ onCaptured }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [prompt] = useState(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)]);
  const [status, setStatus] = useState("idle");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [frameProgress, setFrameProgress] = useState(0);
  const [error, setError] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // The <video> element only exists once status is past "starting", so the
  // stream can't be attached at the moment getUserMedia resolves — it's kept
  // in state and attached here, after the element has mounted. (Attaching
  // inside startCamera silently did nothing: a live camera light, a dead
  // preview, and a capture of black frames.)
  const [stream, setStream] = useState(null);
  const attemptRef = useRef(0);
  const [slowPermission, setSlowPermission] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    video.play().catch((err) => {
      setError(`Couldn't start the camera preview: ${err.message}`);
      setStatus("idle");
    });
  }, [stream, status]);

  const startCamera = async () => {
    setError(null);
    setSlowPermission(false);
    setStatus("starting");
    const attempt = ++attemptRef.current;
    // Not a hard timeout: the browser's permission prompt waits on a human,
    // and a fixed deadline would fail a guest who is still reading it. After a
    // few seconds just hint at where to look; the guest can also cancel.
    const hint = setTimeout(() => attempt === attemptRef.current && setSlowPermission(true), 6000);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      if (attempt !== attemptRef.current) {
        media.getTracks().forEach((t) => t.stop()); // cancelled while the prompt was open
        return;
      }
      streamRef.current = media;
      setStream(media);
      setStatus("ready");
    } catch (err) {
      if (attempt !== attemptRef.current) return;
      setError(cameraErrorMessage(err));
      setStatus("idle");
    } finally {
      clearTimeout(hint);
    }
  };

  const cancelStart = () => {
    attemptRef.current += 1;
    setStatus("idle");
  };

  const beginCountdown = () => {
    setError(null);
    setStatus("counting");
    setCountdown(COUNTDOWN_SECONDS);
  };

  // Ticks the on-screen countdown once a second, then hands off to the
  // actual frame capture — kept as its own effect so the countdown number
  // reliably repaints between ticks instead of racing a single async loop.
  useEffect(() => {
    if (status !== "counting") return;
    if (countdown <= 0) {
      captureAndCheck();
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [status, countdown]);

  const captureAndCheck = async () => {
    setStatus("capturing");
    setFrameProgress(0);
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    const ctx = canvas.getContext("2d");

    const frames = [];
    for (let i = 0; i < FRAME_COUNT; i++) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", 0.85));
      setFrameProgress(i + 1);
      if (i < FRAME_COUNT - 1) await new Promise((r) => setTimeout(r, FRAME_INTERVAL_MS));
    }

    setStatus("checking");
    try {
      const result = await api.kycLivenessCheck(frames);
      if (result.passed) {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const lastFrame = frames[frames.length - 1];
        const blob = await (await fetch(lastFrame)).blob();
        setPreviewUrl(lastFrame);
        setStatus("done");
        onCaptured(new File([blob], "selfie.jpg", { type: "image/jpeg" }));
      } else {
        setStatus("ready");
        setError(FAILURE_MESSAGES[result.reason] || "Liveness check failed — please try again.");
      }
    } catch (err) {
      setStatus("ready");
      setError(err.body?.error || err.message);
    }
  };

  const retake = () => {
    setPreviewUrl(null);
    setError(null);
    startCamera();
  };

  if (status === "done") {
    return (
      <div className="rounded-lg border border-green-300 bg-green-50 p-3">
        <div className="flex items-center gap-3">
          {previewUrl && (
            <img src={previewUrl} alt="Captured selfie" className="h-16 w-16 rounded-full border border-green-300 object-cover" />
          )}
          <div>
            <p className="text-sm font-medium text-green-800">Live selfie captured</p>
            <button type="button" onClick={retake} className="text-xs text-green-700 underline">
              Retake
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-300 p-3">
      {status === "idle" && (
        <button
          type="button"
          onClick={startCamera}
          className="w-full rounded bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-600"
        >
          Start camera for live selfie
        </button>
      )}

      {status === "starting" && (
        <div className="flex items-center justify-center gap-2 rounded bg-slate-100 py-6 text-sm text-slate-500">
          <Spinner /> Requesting camera access…
          {slowPermission && (
            <span className="ml-1 text-xs text-slate-500">
              Waiting for permission — look for the browser's camera prompt.{" "}
              <button type="button" onClick={cancelStart} className="underline">
                Cancel
              </button>
            </span>
          )}
        </div>
      )}

      {status !== "idle" && status !== "starting" && (
        <div>
          <div className="relative overflow-hidden rounded bg-black">
            <video ref={videoRef} muted playsInline className="w-full -scale-x-100 transform" />

            {status === "counting" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <span className="text-6xl font-bold text-white drop-shadow">{countdown}</span>
              </div>
            )}

            {(status === "capturing" || status === "checking") && (
              <div className="absolute inset-x-0 bottom-0 bg-black/50 px-3 py-2">
                <div className="flex gap-1">
                  {Array.from({ length: FRAME_COUNT }).map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 flex-1 rounded-full ${i < frameProgress ? "bg-white" : "bg-white/30"}`}
                    />
                  ))}
                </div>
                <p className="mt-1 text-center text-xs text-white">
                  {status === "capturing" ? "Capturing…" : "Checking…"}
                </p>
              </div>
            )}
          </div>

          {(status === "ready" || status === "counting" || status === "capturing") && (
            <p className="mt-2 rounded bg-slate-100 py-1.5 text-center text-sm font-medium text-slate-700">
              {prompt}
            </p>
          )}

          {status === "ready" && (
            <button
              type="button"
              onClick={beginCountdown}
              className="mt-2 w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Capture
            </button>
          )}

          {status === "checking" && (
            <div className="mt-2 flex items-center justify-center gap-2 text-sm text-slate-500">
              <Spinner /> Checking…
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
          {status === "idle" && (
            <button type="button" onClick={startCamera} className="ml-2 font-medium underline">
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function cameraErrorMessage(err) {
  if (err.name === "NotAllowedError") return "Camera access was denied — allow camera access, or upload a photo instead.";
  if (err.name === "NotFoundError") return "No camera was found on this device — upload a photo instead.";
  if (err.name === "NotReadableError") return "The camera is in use by another app — close it and try again.";
  if (err.name === "SecurityError" || !window.isSecureContext) return "The camera needs a secure (https) connection — or upload a photo instead.";
  return `Camera access failed: ${err.message}`;
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-slate-500" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
