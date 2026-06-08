'use client';
import { Poppins } from 'next/font/google';
import styles from './PrescriptionHeader.module.css';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export default function PrescriptionHeader() {
  return (
    <header className={`${styles['rx-header']} ${poppins.className}`}>
      <div className={styles.left}>
        <div>
          <div className={styles['brand-row']}>
            <img className={styles.logo} src="/logo1.png" alt="Shri Balaji logo" />
            <div className={styles.brand}>
              <div className={styles.name}>Shri Balaji</div>
            </div>
          </div>
          <div className={styles.subtitle} style={{ paddingLeft: '84px', marginTop: '-3px' }}>
            <div className={styles.sub1}>ADVANCED DENTAL CARE</div>
            <div className={styles.sub2}>& IMPLANT CENTER</div>
          </div>
        </div>
        <div className={styles.timing}>
          <span>MON – SUN : 10 AM – 1 PM &nbsp;|&nbsp; 4 PM – 8 PM</span>
          <span>SAT : Closed</span>
        </div>
      </div>
      <div className={styles.divider} />
      <div className={styles.right}>
        <div className={styles['doc-name-row']}>
          <span className={styles.ico}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="7.5" r="3.8" />
              <path d="M4.5 21c0-4.1 3.4-7 7.5-7s7.5 2.9 7.5 7" />
            </svg>
          </span>
          <span className={styles['doc-name']}>DR. M. VISHNU VARDHAN, BDS, MOI</span>
        </div>
        <div className={styles['doc-desg']}>Dental Surgeon | Oral Implantologist (Hyderabad)</div>
        <div className={styles['doc-reg']}>Reg. No. - CGDC/G/24/4198</div>
        <div className={styles.contacts}>
          <div className={styles.crow}>
            <span className={styles.badge}>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.4 0 .8-.3 1l-2.2 2.2z" />
              </svg>
            </span>
            <a className={styles.ct} href="tel:+919111594782">+91- 9111594782</a>
            <span className={`${styles.badge} ${styles.gap}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
              </svg>
            </span>
            <a className={styles.ct} href="https://instagram.com/shribalaji_adc">shribalaji_adc</a>
          </div>
          <div className={styles.crow}>
            <span className={styles.badge}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3.5 7.5l8.5 6 8.5-6" />
              </svg>
            </span>
            <a className={styles.ct} href="mailto:shribalajiadc@gmail.com">shribalajiadc@gmail.com</a>
          </div>
          <div className={styles.crow}>
            <span className={styles.badge}>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2c-3.9 0-7 3.1-7 7 0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
              </svg>
            </span>
            <span>MIG-1/321, Amdi Nagar, Hudco, Bhilai</span>
          </div>
        </div>
      </div>
    </header>
  );
}
