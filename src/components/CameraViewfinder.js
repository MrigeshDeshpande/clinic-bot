'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Camera, RefreshCw, Check, FlipHorizontal } from 'lucide-react';

export default function CameraViewfinder({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const previewUrlRef = useRef(null);
  const [facingMode, setFacingMode] = useState('environment');
  const [captured, setCaptured] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async (mode) => {
    setLoading(true);
    setError(null);
    stopStream();
    try {
      const constraints = {
        video: {
          facingMode: mode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setFacingMode(mode);
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Camera permission denied. Please allow camera access in your browser settings.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found on this device.');
      } else {
        setError('Could not access camera: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [stopStream]);

  useEffect(() => {
    startCamera('environment');
    return () => {
      stopStream();
      revokePreview();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      revokePreview();
      const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const preview = URL.createObjectURL(blob);
      previewUrlRef.current = preview;
      setCaptured({ file, preview });
    }, 'image/jpeg', 0.92);
  };

  const handleRetake = () => {
    revokePreview();
    setCaptured(null);
  };

  const handleAccept = () => {
    if (captured) {
      onCapture(captured.file);
    }
    stopStream();
    revokePreview();
    onClose();
  };

  const toggleCamera = () => {
    revokePreview();
    setCaptured(null);
    startCamera(facingMode === 'environment' ? 'user' : 'environment');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-black/60">
        <button
          onClick={() => { stopStream(); revokePreview(); onClose(); }}
          className="p-2 rounded-full hover:bg-white/20 text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        <span className="text-white text-sm font-semibold">Take Photo</span>
        <div className="w-9" />
      </div>

      {error && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <Camera className="w-12 h-12 text-white/50 mb-4" />
          <p className="text-white text-sm mb-4">{error}</p>
          <button
            onClick={() => startCamera(facingMode)}
            className="px-6 py-2 bg-white text-gray-900 text-sm font-medium rounded-xl hover:bg-gray-100 transition-all"
          >
            Try Again
          </button>
        </div>
      )}

      {loading && !error && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {!error && (
        <div className="flex-1 relative flex items-center justify-center bg-black">
          <canvas ref={canvasRef} className="hidden" />

          {!captured && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-contain ${facingMode === 'user' ? '-scale-x-100' : ''}`}
            />
          )}

          {captured && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={captured.preview}
              alt="Captured"
              className="w-full h-full object-contain"
            />
          )}

          {!captured && !loading && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-72 h-72 rounded-2xl border-2 border-white/40" />
            </div>
          )}
        </div>
      )}

      {!error && !loading && (
        <div className="flex items-center justify-center gap-12 px-4 py-6 bg-black/60">
          {!captured ? (
            <>
              <button
                onClick={toggleCamera}
                className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition-all"
                title="Switch camera"
              >
                <FlipHorizontal className="w-5 h-5" />
              </button>

              <button
                onClick={handleCapture}
                className="w-16 h-16 rounded-full border-4 border-white bg-white/20 hover:bg-white/30 transition-all flex items-center justify-center active:scale-90"
              >
                <div className="w-12 h-12 rounded-full bg-white" />
              </button>

              <div className="w-9" />
            </>
          ) : (
            <>
              <button
                onClick={handleRetake}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-sm font-medium transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                Retake
              </button>

              <button
                onClick={handleAccept}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white text-gray-900 text-sm font-medium hover:bg-gray-100 transition-all active:scale-95"
              >
                <Check className="w-4 h-4" />
                Use Photo
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
