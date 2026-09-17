import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

// Purely a UX prompt — the backend never checks which gesture actually
// happened (see issuer/src/pipeline/liveness.js), only that a face was
// present throughout and the frames actually differ. Showing a random
// prompt still matters: it's what gets a live person to move at all,
// which is the thing being checked.
const PROMPTS = ["Blink twice", "Turn your head left, then right", "Smile", "Nod your head"];
const FRAME_COUNT = 4;
const FRAME_INTERVAL_MS = 400;

const FAILURE_MESSAGES = {
  face_not_detected: "We couldn't see a face clearly in every frame — make sure your face is centered and well-lit.",
  multiple_faces: "More than one face was detected — make sure you're alone in frame.",
  no_motion_detected: "That looked too still — please follow the prompt and move naturally, not just hold a photo up.",
  insufficient_frames: "Capture was interrupted — please try again.",
  too_many_frames: "Something went wrong with the capture — please try again.",
};

// Live camera capture + Section 9.3's liveness challenge. Requires real
// camera access, so it only runs where that's available; GuestKycPage
// falls back to a plain file upload when it isn't (see its own comment).
export function LivenessCapture({ onCaptured }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [prompt] = useState(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)]);
  const [status, setStatus] = useState("idle"); // idle | starting | ready | capturing | checking | failed
  const [error, setError] = useState(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startCamera = async () => {
    setError(null);
    setStatus("starting");
    try {
      // A blocked/never-answered permission prompt can leave getUserMedia
      // pending forever rather than rejecting (observed against this
      // project's own sandboxed browser-pane testing) — a plain `await`
      // here would leave the button stuck on "starting…" indefinitely.
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timed out waiting for camera access")), 8000)),
      ]);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus("ready");
    } catch (err) {
      setError(`Camera access failed: ${err.message}`);
      setStatus("idle");
    }
  };

  const captureAndCheck = async () => {
    setStatus("capturing");
    setError(null);
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    const ctx = canvas.getContext("2d");

    const frames = [];
    for (let i = 0; i < FRAME_COUNT; i++) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", 0.85));
      if (i < FRAME_COUNT - 1) await new Promise((r) => setTimeout(r, FRAME_INTERVAL_MS));
    }

    setStatus("checking");
    try {
      const result = await api.kycLivenessCheck(frames);
      if (result.passed) {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const blob = await (await fetch(frames[frames.length - 1])).blob();
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

  return (
    <div className="rounded border border-slate-300 p-3">
      {status === "idle" && (
        <button
          type="button"
          onClick={startCamera}
          className="w-full rounded bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-600"
        >
          Start camera for live selfie
        </button>
      )}

      {status !== "idle" && (
        <div>
          <video ref={videoRef} muted playsInline className="w-full rounded bg-black" />
          {(status === "ready" || status === "capturing" || status === "checking") && (
            <p className="mt-2 text-center text-sm font-medium text-slate-700">Prompt: {prompt}</p>
          )}
          {status === "ready" && (
            <button
              type="button"
              onClick={captureAndCheck}
              className="mt-2 w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Capture
            </button>
          )}
          {(status === "capturing" || status === "checking") && (
            <p className="mt-2 text-center text-sm text-slate-500">
              {status === "capturing" ? "Capturing…" : "Checking…"}
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
