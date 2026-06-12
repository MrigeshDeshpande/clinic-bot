'use client';

import { useState } from 'react';
import { X, Download, FileImage, FileAudio, File, ChevronLeft, ChevronRight } from 'lucide-react';

function getMediaType(key) {
  if (!key) return 'file';
  if (key.includes('_photo.')) return 'photo';
  if (key.includes('_audio.')) return 'audio';
  return 'file';
}

function getMediaLabel(key) {
  const type = getMediaType(key);
  const parts = key?.split('/') || [];
  const filename = parts[parts.length - 1] || key || '';
  if (type === 'photo') return 'Photo ' + filename.replace(/^\d+_photo\./, '');
  if (type === 'audio') return 'Audio ' + filename.replace(/^\d+_audio\./, '');
  return filename;
}

function getFileIcon(key) {
  const type = getMediaType(key);
  if (type === 'photo') return <FileImage className="w-4 h-4" />;
  if (type === 'audio') return <FileAudio className="w-4 h-4" />;
  return <File className="w-4 h-4" />;
}

export default function MediaViewer({ mediaKeys, getSignedUrl }) {
  const [openIndex, setOpenIndex] = useState(null);

  if (!mediaKeys || mediaKeys.length === 0) return null;

  const photos = mediaKeys.filter(k => getMediaType(k) === 'photo');
  const nonPhotos = mediaKeys.filter(k => getMediaType(k) !== 'photo');

  return (
    <div>
      {/* Photo grid */}
      {photos.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            <FileImage className="w-3 h-3" />
            Photos ({photos.length})
          </div>
          <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
            {photos.map((key, idx) => (
              <button type="button"
                key={key}
                onClick={(e) => { e.stopPropagation(); console.log('[MEDIA_VIEWER] Click photo, index:', mediaKeys.indexOf(key)); setOpenIndex(mediaKeys.indexOf(key)); }}
                className="aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-50 hover:border-blue-300 hover:shadow-md transition-all group relative cursor-pointer"
              >
                <img
                  src={getSignedUrl(key)}
                  alt={getMediaLabel(key)}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Non-photo files */}
      {nonPhotos.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            <File className="w-3 h-3" />
            Attachments ({nonPhotos.length})
          </div>
          <div className="space-y-1.5">
            {nonPhotos.map((key) => (
              <a
                key={key}
                href={getSignedUrl(key)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100 hover:bg-blue-50 hover:border-blue-200 transition-all text-sm text-gray-700"
              >
                {getFileIcon(key)}
                <span className="flex-1 truncate">{getMediaLabel(key)}</span>
                <Download className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Photo expand — big but no fullscreen overlay */}
      {openIndex !== null && mediaKeys[openIndex] && getMediaType(mediaKeys[openIndex]) === 'photo' && (
        <div className="relative mt-2">
          <div className="relative inline-block max-w-full">
            <img
              src={getSignedUrl(mediaKeys[openIndex])}
              alt={getMediaLabel(mediaKeys[openIndex])}
              className="max-w-full max-h-[80vh] object-contain rounded-xl border border-gray-200 shadow-lg cursor-pointer"
              onClick={() => setOpenIndex(null)}
            />
            <button type="button"
              onClick={() => setOpenIndex(null)}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            {mediaKeys.filter(k => getMediaType(k) === 'photo').length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
                <button type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const photoIndices = mediaKeys
                      .map((k, i) => ({ key: k, idx: i }))
                      .filter(x => getMediaType(x.key) === 'photo')
                      .map(x => x.idx);
                    const currentPhotoPos = photoIndices.indexOf(openIndex);
                    const prev = photoIndices[(currentPhotoPos - 1 + photoIndices.length) % photoIndices.length];
                    setOpenIndex(prev);
                  }}
                  className="w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const photoIndices = mediaKeys
                      .map((k, i) => ({ key: k, idx: i }))
                      .filter(x => getMediaType(x.key) === 'photo')
                      .map(x => x.idx);
                    const currentPhotoPos = photoIndices.indexOf(openIndex);
                    const next = photoIndices[(currentPhotoPos + 1) % photoIndices.length];
                    setOpenIndex(next);
                  }}
                  className="w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
