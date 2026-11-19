import { useState, type ReactNode } from 'react';
import { Icon } from '../lib/icons';
import { back } from '../app/actions';
import type { Item } from '../lib/live';
import { noticeImages } from '../components/format';
import { openModal } from '../app/actions';

export function ModalHead({ title, subtitle = '', eyebrow = '', onClose, closeAction = 'close' }: {
  title: ReactNode; subtitle?: string; eyebrow?: string; onClose?: () => void; closeAction?: string;
}) {
  return (
    <div className="modal-head">
      <div>{eyebrow ? <div className="step-label">{eyebrow}</div> : null}<h2 id="modal-title">{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
      <button className="close-btn" data-action={closeAction} aria-label="닫기" onClick={onClose || (() => back(true))}><Icon name="close" /></button>
    </div>
  );
}
export const BackFooter = () => (
  <div className="modal-footer"><button className="secondary" data-action="detail-back" onClick={() => back()}>뒤로가기</button></div>
);
export const ApplicationNotice = () => (
  <div className="application-notice" role="note">
    <span className="application-notice-icon" aria-hidden="true">⚠️</span>
    <span className="application-notice-copy">실제 신청은 한성대학교 홈페이지에서 진행해야 합니다.<br />아래 버튼을 통해 사이트로 이동해주세요.</span>
  </div>
);

function GalleryImage({ item, index, url, alt }: { item: Item; index: number; url: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure>
      <button type="button" className="notice-image-button" data-action="image-open" data-id={item.id} data-index={index} aria-label={`${alt} 확대 보기`} disabled={failed}
        onClick={() => openModal({ kind: 'image', id: item.id, index })}>
        <img src={url} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" hidden={failed} onError={() => setFailed(true)} />
      </button>
      <figcaption className="image-fallback" hidden={!failed}>이미지를 불러오지 못했어요. 아래 공식 사이트에서 확인해 주세요.</figcaption>
    </figure>
  );
}
export function ImageGallery({ item }: { item: Item }) {
  const images = noticeImages(item);
  if (!images.length) return null;
  return (
    <section className="detail-group notice-images">
      <h3>공지 이미지</h3>
      {images.map((img, index) => <GalleryImage key={img.url} item={item} index={index} url={img.url} alt={img.alt} />)}
      <p className="signup-hint">이미지를 누르면 크게 볼 수 있어요.</p>
    </section>
  );
}
export function ImageViewerImage({ url, alt }: { url: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <>
      <img src={url} alt={alt} referrerPolicy="no-referrer" hidden={failed} onError={() => setFailed(true)} />
      <p className="image-fallback" hidden={!failed}>이미지를 불러오지 못했어요. 원문에서 확인해 주세요.</p>
    </>
  );
}
