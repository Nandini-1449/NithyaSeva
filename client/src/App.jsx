import './App.css'
import professionalWorkers from './assets/professional-workers.svg'

const services = [
  {
    number: '01',
    title: 'Find Skilled Workers',
    description:
      'Discover reliable local professionals for everyday tasks, home services, and skilled work.',
    action: 'Find a worker',
    icon: '✦',
  },
  {
    number: '02',
    title: 'Discover Work',
    description:
      'Explore suitable job opportunities, connect with customers, and grow your work profile.',
    action: 'Explore jobs',
    icon: '↗',
  },
  {
    number: '03',
    title: 'Build Trust',
    description:
      'Create a trusted work community with clear job details, transparent records, and reviews.',
    action: 'Learn about trust',
    icon: '✓',
  },
]

function App() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#home" aria-label="NithyaSeva home">
          <span className="brand-mark">N</span>
          <span>Nithya<span className="brand-accent">Seva</span></span>
        </a>
        <nav aria-label="Main navigation">
          <a className="nav-link active" href="#home">Home</a>
          <a className="nav-link" href="#services">Services</a>
          <a className="nav-link" href="#about">About us</a>
          <a className="nav-cta" href="#services">Get started <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      <section className="hero" id="home">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-dot" /> OPPORTUNITY. DIGNITY. GROWTH.</p>
          <h1>Good work deserves<br />a <span>better future.</span></h1>
          <p className="hero-description">
            Connecting skilled workers with meaningful opportunities through trust,
            transparency, and a community that values every skill.
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#services">Explore NithyaSeva <span aria-hidden="true">↗</span></a>
            <a className="text-button" href="#about">Discover our mission <span aria-hidden="true">→</span></a>
          </div>
          <div className="hero-note">
            <span className="note-check">✓</span>
            <span>Built for workers. Designed for a stronger community.</span>
          </div>
        </div>
        <div className="hero-art" aria-label="Professional service tools arranged in a floating composition">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-sun" />
          <div className="art-leaf leaf-one" />
          <div className="art-leaf leaf-two" />
          <img
            className="professional-workers-image"
            src={professionalWorkers}
            alt="Professional toolbox, maintenance tools, cleaning supplies, gloves, folded towels and a plant"
          />
          <div className="floating-chip chip-top"><span className="chip-icon">✦</span><span><strong>Every skill matters</strong><small>Every worker counts</small></span></div>
          <div className="floating-chip chip-bottom"><span className="chip-icon chip-check">✓</span><span><strong>Built on trust</strong><small>Clear and transparent</small></span></div>
        </div>
      </section>

      <section className="services-section" id="services">
        <div className="section-heading">
          <div><p className="eyebrow">A PLATFORM FOR EVERYONE</p><h2>One community.<br /><span>More possibilities.</span></h2></div>
          <p className="section-intro">Whether you need a helping hand or are looking for your next opportunity, NithyaSeva brings people and possibilities together.</p>
        </div>
        <div className="service-grid">
          {services.map((service) => (
            <article className="service-card" key={service.number}>
              <div className="service-card-top"><span className="service-icon">{service.icon}</span><span className="service-number">{service.number}</span></div>
              <h3>{service.title}</h3>
              <p>{service.description}</p>
              <a href="#about" className="service-link">{service.action} <span aria-hidden="true">→</span></a>
            </article>
          ))}
        </div>
      </section>

      <section className="mission-section" id="about">
        <div className="mission-symbol" aria-hidden="true"><span>✳</span></div>
        <div><p className="eyebrow">OUR PURPOSE</p><h2>Work with dignity.<br /><span>Grow with confidence.</span></h2></div>
        <p className="mission-copy">NithyaSeva is building a more connected, dependable, and empowering service marketplace—where people can find work, access opportunities, and build trust through every interaction.</p>
      </section>

      <footer className="site-footer">
        <a className="brand footer-brand" href="#home"><span className="brand-mark">N</span><span>Nithya<span className="brand-accent">Seva</span></span></a>
        <p>Every skill has value. Every worker deserves opportunity.</p>
        <span className="footer-copy">© {new Date().getFullYear()} NithyaSeva</span>
      </footer>
    </main>
  )
}

export default App
