import { useCallback, useEffect, useRef, useState } from 'react';

const ANALYSER_FFT_SIZE = 256;
const ANALYSER_SMOOTHING = 0.85;
const LEVEL_GAIN = 3.2;
const LEVEL_SMOOTHING_OLD = 0.72;
const LEVEL_SMOOTHING_NEW = 0.28;

function getAudioContextClass() {
  const contextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!contextClass) {
    throw new Error('AudioContext is not supported in this browser.');
  }

  return contextClass;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function useMicVolume() {
  const [isListening, setIsListening] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Uint8Array | null>(null);

  const stopListening = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }

      streamRef.current = null;
    }

    if (contextRef.current) {
      void contextRef.current.close();
      contextRef.current = null;
    }

    dataRef.current = null;
    setIsListening(false);
    setLevel(0);
  }, []);

  const startListening = useCallback(async () => {
    if (isListening) {
      return;
    }

    try {
      setError(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const AudioContextClass = getAudioContextClass();
      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = ANALYSER_FFT_SIZE;
      analyser.smoothingTimeConstant = ANALYSER_SMOOTHING;

      source.connect(analyser);

      const data = new Uint8Array(analyser.fftSize);

      streamRef.current = stream;
      contextRef.current = audioContext;
      analyserRef.current = analyser;
      dataRef.current = data;

      setIsListening(true);

      const updateLevel = () => {
        const currentAnalyser = analyserRef.current;
        const currentData = dataRef.current;

        if (!currentAnalyser || !currentData) {
          return;
        }

        currentAnalyser.getByteTimeDomainData(currentData);

        let total = 0;

        for (let index = 0; index < currentData.length; index += 1) {
          const centered = (currentData[index] - 128) / 128;
          total += centered * centered;
        }

        const rms = Math.sqrt(total / currentData.length);
        const normalized = clamp(rms * LEVEL_GAIN, 0, 1);

        setLevel((previousLevel) => previousLevel * LEVEL_SMOOTHING_OLD + normalized * LEVEL_SMOOTHING_NEW);
        rafRef.current = requestAnimationFrame(updateLevel);
      };

      rafRef.current = requestAnimationFrame(updateLevel);
    } catch (unknownError) {
      stopListening();

      const message = unknownError instanceof Error ? unknownError.message : 'Microphone access failed.';
      setError(message);
    }
  }, [isListening, stopListening]);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    isListening,
    level,
    error,
    startListening,
    stopListening
  };
}
