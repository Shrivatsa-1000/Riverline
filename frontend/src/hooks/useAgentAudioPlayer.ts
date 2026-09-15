import { useCallback, useEffect, useRef, useState } from 'react';

export type AudioPlayFailureReason =
  | 'missing-audio'
  | 'invalid-audio'
  | 'playback-blocked'
  | 'playback-error';

export interface AudioPlayResult {
  ok: boolean;
  reason?: AudioPlayFailureReason;
}

function createAudioBlobUrl(base64Value: string, mimeType: string) {
  const cleaned = base64Value.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '').trim();

  const binary = window.atob(cleaned);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const blob = new Blob([bytes], {
    type: mimeType || 'audio/mpeg'
  });

  return URL.createObjectURL(blob);
}

export function useAgentAudioPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const finishPlaybackRef = useRef<(() => void) | null>(null);

  const clearAudioState = useCallback(() => {
    const audio = audioRef.current;

    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    }

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    if (finishPlaybackRef.current) {
      finishPlaybackRef.current();
      return;
    }

    clearAudioState();
    setIsPlaying(false);
  }, [clearAudioState]);

  const play = useCallback(
    async (audioBase64?: string, audioMimeType?: string): Promise<AudioPlayResult> => {
      if (!audioBase64) {
        return {
          ok: false,
          reason: 'missing-audio'
        };
      }

      stop();

      let blobUrl = '';

      try {
        blobUrl = createAudioBlobUrl(audioBase64, audioMimeType || 'audio/mpeg');
      } catch {
        return {
          ok: false,
          reason: 'invalid-audio'
        };
      }

      return new Promise<AudioPlayResult>((resolve) => {
        const audio = new Audio(blobUrl);
        let finished = false;

        const finish = (reason?: AudioPlayFailureReason) => {
          if (finished) {
            return;
          }

          finished = true;
          finishPlaybackRef.current = null;
          clearAudioState();
          setIsPlaying(false);

          resolve(
            reason
              ? {
                  ok: false,
                  reason
                }
              : {
                  ok: true
                }
          );
        };

        finishPlaybackRef.current = () => {
          finish();
        };

        audioRef.current = audio;
        audioUrlRef.current = blobUrl;

        audio.preload = 'auto';
        audio.onended = () => finish();
        audio.onerror = () => finish('playback-error');

        setIsPlaying(true);

        void audio.play().catch(() => {
          finish('playback-blocked');
        });
      });
    },
    [clearAudioState, stop]
  );

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    isPlaying,
    play,
    stop
  };
}
