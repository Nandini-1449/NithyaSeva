import { useCallback, useEffect, useState } from 'react'
import './Dashboard.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

export default function Dashboard({ user, onLogout }) {
  const [section, setSection] = useState(user.role === 'worker' ? 'jobs' : 'workers')
  const [workers, setWorkers] = useState([])
  const [jobs, setJobs] = useState([])
  const [mine, setMine] = useState([])
  const [assignments, setAssignments] = useState([])
  const [profile, setProfile] = useState({ bio: '', skills: [], experienceYears: 0, serviceArea: '', hourlyRate: '', availabilityStatus: 'available' })
  const [applications, setApplications] = useState({})
  const [notifications, setNotifications] = useState([])
  const [expandedNotificationId, setExpandedNotificationId] = useState(null)
  const [search, setSearch] = useState('')
  const [jobLocationMode, setJobLocationMode] = useState('all')
  const [nearbyRadius, setNearbyRadius] = useState('25')
  const [currentCoordinates, setCurrentCoordinates] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [jobForm, setJobForm] = useState({ title: '', description: '', category: 'Household services', serviceLocation: '', budget: '', workerCount: '1' })
  const [applyForm, setApplyForm] = useState({ jobId: '', proposedPrice: '', message: '' })
  const [cancelJobTarget, setCancelJobTarget] = useState(null)

  const request = useCallback(async (path, options = {}) => {
    const token = localStorage.getItem('nithyaseva_token')
    const response = await fetch(API + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(options.headers || {}) },
    })
    const data = await response.json().catch(() => ({}))
    if (response.status === 401) {
      localStorage.removeItem('nithyaseva_token')
      localStorage.removeItem('nithyaseva_user')
      onLogout()
      throw new Error('Your session expired. Please log in again.')
    }
    if (!response.ok || data.success === false) throw new Error(data.message || 'Request failed. Please try again.')
    return data
  }, [onLogout])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const jobParams = new URLSearchParams({ status: 'open' })
      if (jobLocationMode === 'nearby' && currentCoordinates) {
        jobParams.set('mode', 'nearby')
        jobParams.set('latitude', String(currentCoordinates.latitude))
        jobParams.set('longitude', String(currentCoordinates.longitude))
        jobParams.set('radiusKm', nearbyRadius)
      }
      const tasks = [request('/notifications')]
      if (user.role === 'worker') tasks.unshift(request('/jobs?' + jobParams.toString()))
      if (user.role === 'customer') tasks.push(request('/workers'), request('/jobs/mine'))
      if (user.role === 'worker') tasks.push(request('/workers/me'), request('/jobs/assigned/mine'))
      const values = await Promise.all(tasks)
      if (user.role === 'worker') {
        setJobs(values[0].jobs || [])
        const p = values[2].profile
        setNotifications(values[1].notifications || [])
        setProfile({ bio: p.bio || '', skills: p.skills || [], experienceYears: p.experience_years || 0, serviceArea: p.service_area || '', hourlyRate: p.hourly_rate ?? '', availabilityStatus: p.availability_status || 'available' })
        setAssignments(values[3].assignments || [])
      } else {
        setNotifications(values[0].notifications || [])
        setWorkers(values[1].workers || [])
        setMine(values[2].jobs || [])
      }
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [request, user.role, jobLocationMode, currentCoordinates, nearbyRadius])

  useEffect(() => { load() }, [load])

  async function act(fn, successText) {
    setMessage(''); setError('')
    try {
      await fn()
      setMessage(successText)
      await load()
      return true
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.')
      return false
    }
  }

  async function createJob(e) {
    e.preventDefault()
    const posted = await act(
      () => request('/jobs', {
        method: 'POST',
        body: JSON.stringify({
          ...jobForm,
          budget: jobForm.budget === '' ? null : Number(jobForm.budget),
          workerCount: Number(jobForm.workerCount || 1),
          ...(currentCoordinates ? { latitude: currentCoordinates.latitude, longitude: currentCoordinates.longitude } : {}),
        }),
      }),
      'Your job has been posted.'
    )
    if (!posted) return
    setJobForm({ title: '', description: '', category: 'Household services', serviceLocation: '', budget: '', workerCount: '1' })
    setSection('myjobs')
  }

  function enableNearbyJobs() {
    if (!navigator.geolocation) {
      setError('Your browser does not support location sharing. You can still use All Jobs.')
      return
    }
    setError('')
    navigator.geolocation.getCurrentPosition(
      position => {
        setCurrentCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude })
        setJobLocationMode('nearby')
        setMessage('Nearby search enabled. Your coordinates are used for this search and are not displayed to other users.')
      },
      () => setError('Location permission was not granted or location is unavailable. Allow location access in your browser, or choose All Jobs.'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    )
  }

  async function apply(jobId) {
    setApplyForm({ jobId: String(jobId), proposedPrice: '', message: '' })
    setError('')
    setMessage('')
  }

  async function submitApplication(e, jobId) {
    e.preventDefault()
    const price = applyForm.proposedPrice.trim()
    if (price && (!Number.isFinite(Number(price)) || Number(price) < 0)) {
      setError('Enter a valid non-negative proposed price, or leave it blank.')
      return
    }
    const sent = await act(
      () => request('/jobs/' + jobId + '/applications', {
        method: 'POST',
        body: JSON.stringify({ proposedPrice: price ? Number(price) : null, message: capitalizeText(applyForm.message) })
      }),
      'Your application has been sent.'
    )
    if (sent) setApplyForm({ jobId: '', proposedPrice: '', message: '' })
  }

  async function showApplications(jobId) {
    setError(''); setMessage('')
    try {
      const data = await request('/jobs/' + jobId + '/applications')
      setApplications(prev => ({ ...prev, [jobId]: data.applications || [] }))
      setSection('applications')
    } catch (e) { setError(e.message) }
  }

  async function accept(jobId, applicationId) {
    await act(() => request('/jobs/' + jobId + '/applications/' + applicationId + '/accept', { method: 'POST', body: '{}' }), 'Worker selected and agreement created.')
  }

  async function changeStatus(jobId, status) {
    await act(() => request('/jobs/' + jobId + '/status', { method: 'PATCH', body: JSON.stringify({ status }) }), 'Job status updated.')
  }

  async function saveProfile(e) {
    e.preventDefault()
    await act(() => request('/workers/me', { method: 'PUT', body: JSON.stringify({ ...profile, skills: Array.isArray(profile.skills) ? profile.skills : String(profile.skills).split(',').map(s => s.trim()).filter(Boolean), experienceYears: Number(profile.experienceYears), hourlyRate: profile.hourlyRate === '' ? null : Number(profile.hourlyRate) }) }), 'Worker profile saved.')
  }

  async function markRead(id) {
    await act(() => request('/notifications/' + id + '/read', { method: 'PATCH', body: '{}' }), 'Notification marked as read.')
  }

  const money = value => value === null || value === undefined || value === '' ? 'Negotiable' : '₹' + Number(value).toLocaleString('en-IN')
  const tabs = user.role === 'customer'
    ? [['workers', 'Find workers'], ['post', 'Post a job'], ['myjobs', 'My jobs'], ['applications', 'Applications'], ['notifications', 'Notifications']]
    : [['jobs', 'Find jobs'], ['mywork', 'My work'], ['profile', 'My profile'], ['notifications', 'Notifications']]

  return <section className="dashboard">
    <div className="dashboard-heading">
      <div><p className="dash-eyebrow">YOUR NITHYASEVA WORKSPACE</p><h1>Hello, <span>{user.full_name || 'there'}</span></h1><p>Manage opportunities, work, and your account from one place.</p></div>
      <button className="dash-refresh" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : '↻ Refresh'}</button>
    </div>
    <div className="dash-tabs">{tabs.map(([id, label]) => <button key={id} className={section === id ? 'selected' : ''} onClick={() => setSection(id)}>{label}</button>)}</div>
    {message && <div className="dash-alert good" role="status">{message}</div>}
    {error && <div className="dash-alert bad" role="alert">{error}</div>}
    {loading && <p className="dash-muted">Loading your latest information…</p>}

    {section === 'workers' && user.role === 'customer' && <div className="dash-grid">{workers.filter(w => !search || (w.full_name + ' ' + (w.skills || []).join(' ') + ' ' + (w.service_area || '')).toLowerCase().includes(search.toLowerCase())).map(w => <article className="dash-card" key={w.id}><div className="dash-card-icon">✦</div><h3>{w.full_name}</h3><p>{w.bio || 'Skilled local service professional'}</p><p><b>Skills:</b> {(w.skills || []).join(', ') || 'Not added yet'}</p><p><b>Area:</b> {w.service_area || 'Not specified'}</p><p><b>Experience:</b> {w.experience_years || 0} years</p><p><b>Rate:</b> {money(w.hourly_rate)}</p><span className={'status-pill ' + (w.availability_status === 'available' ? 'available' : '')}>{w.availability_status || 'unavailable'}</span></article>)}{!workers.length && <Empty text="No worker profiles yet. Check back after workers complete their profiles." />}</div>}

    {section === 'jobs' && user.role === 'worker' && <><div className="job-discovery-controls"><label>Search jobs<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by title, description or category" /></label><div className="job-discovery-actions"><button type="button" className={jobLocationMode === 'all' ? 'dash-primary' : 'dash-secondary'} onClick={() => { setJobLocationMode('all'); setMessage('Showing all open jobs.'); setError('') }}>All Jobs</button><button type="button" className={jobLocationMode === 'nearby' ? 'dash-primary' : 'dash-secondary'} onClick={enableNearbyJobs}>Near Me</button><label>Distance<select value={nearbyRadius} onChange={e => setNearbyRadius(e.target.value)}><option value="5">Within 5 km</option><option value="10">Within 10 km</option><option value="25">Within 25 km</option><option value="50">Within 50 km</option><option value="100">Within 100 km</option><option value="200">Within 200 km</option></select></label></div>{jobLocationMode === 'nearby' && !currentCoordinates && <p className="dash-muted">Choose Near Me to share your location for distance filtering.</p>}</div><div className="dash-grid">{jobs.filter(j => jobMatchesSearch(j, search)).map(j => <article className="dash-card" key={j.id}><span className="status-pill">{j.status}</span><h3>{j.title}</h3><p>{j.description}</p><p><b>Category:</b> {j.category}</p><p><b>Location:</b> {j.service_location}</p>{j.distance_km != null && <p><b>Distance:</b> {j.distance_km} km away</p>}<p><b>Budget:</b> {money(j.budget)}</p><p className="dash-muted">Posted by {j.customer_name || 'Customer'} · {new Date(j.created_at).toLocaleDateString()}</p>{user.role === 'worker' && (applyForm.jobId === String(j.id) ? <form className="dash-form application-form" onSubmit={e => submitApplication(e, j.id)}><h4>Apply for this job</h4><label>Proposed price in INR (optional)<input type="number" min="0" step="0.01" value={applyForm.proposedPrice} onChange={e => setApplyForm({ ...applyForm, proposedPrice: e.target.value })} placeholder="Leave blank to use the customer budget" /></label><label>Short message to the customer (optional)<textarea rows="3" maxLength="1500" spellCheck="true" value={applyForm.message} onChange={e => setApplyForm({ ...applyForm, message: capitalizeText(e.target.value) })} onBlur={e => e.target.value && setApplyForm(f => ({ ...f, message: capitalizeText(e.target.value) }))} placeholder="Describe how you can help with this job" /></label><div className="application-form-actions"><button className="dash-primary" type="submit" disabled={loading}>Send application</button><button className="dash-secondary" type="button" onClick={() => setApplyForm({ jobId: '', proposedPrice: '', message: '' })}>Cancel</button></div></form> : <button className="dash-primary" onClick={() => apply(j.id)}>Apply for this job ↗</button>)}</article>)}{!jobs.length && <Empty text={jobLocationMode === 'nearby' ? 'No jobs with saved coordinates were found within this distance. Try a larger distance or All Jobs.' : 'No open jobs at the moment. Please check back later.'} />}</div></>}

    {section === 'post' && user.role === 'customer' && <form className="dash-form" onSubmit={createJob}><h2>Post a new job</h2><p>Describe the work clearly so workers can decide whether to apply.</p><label>Job title<input required maxLength="160" spellCheck="true" value={jobForm.title} onChange={e => setJobForm({ ...jobForm, title: capitalizeText(e.target.value) })} onBlur={e => e.target.value && setJobForm(f => ({ ...f, title: capitalizeText(e.target.value) }))} placeholder="e.g. Repair a leaking kitchen tap" /></label><label>Category<select required value={jobForm.category} onChange={e => setJobForm({ ...jobForm, category: e.target.value })}>{['Household services','Society / apartment services','Construction and building work','Plumbing','Electrical work','Cleaning and housekeeping','Painting','Carpentry','Gardening and outdoor work','Moving and loading','Security services','Elderly care and assistance','Other services'].map(category => <option key={category} value={category}>{category}</option>)}</select></label><label>Work description<textarea required maxLength="10000" rows="4" spellCheck="true" value={jobForm.description} onChange={e => setJobForm({ ...jobForm, description: capitalizeText(e.target.value) })} onBlur={e => e.target.value && setJobForm(f => ({ ...f, description: capitalizeText(e.target.value) }))} /></label><label>Service location<input required maxLength="1000" spellCheck="true" value={jobForm.serviceLocation} onChange={e => setJobForm({ ...jobForm, serviceLocation: capitalizeText(e.target.value) })} onBlur={e => e.target.value && setJobForm(f => ({ ...f, serviceLocation: capitalizeText(e.target.value) }))} placeholder="Area or locality" /></label><div className="optional-location"><button type="button" className="dash-secondary" onClick={enableNearbyJobs}>{currentCoordinates ? '✓ Location attached for nearby search' : 'Optional: use my location for nearby search'}</button><p className="dash-muted">Only approximate coordinates supplied by your browser are saved with this job. You can skip this.</p></div><label>Number of workers needed<input required type="number" min="1" max="10000" step="1" value={jobForm.workerCount} onChange={e => setJobForm({ ...jobForm, workerCount: e.target.value })} /></label><label>Budget in INR (optional)<input type="number" min="0" step="0.01" value={jobForm.budget} onChange={e => setJobForm({ ...jobForm, budget: e.target.value })} /></label><button className="dash-primary" disabled={loading}>Publish job</button></form>}

    {section === 'myjobs' && user.role === 'customer' && <div className="dash-grid">{mine.map(j => <article className="dash-card" key={j.id}><span className="status-pill">{j.status}</span><h3>{j.title}</h3><p>{j.description}</p><p><b>Budget:</b> {money(j.budget)}</p><p><b>Workers requested:</b> {j.worker_count || 1}</p><p><b>Workers assigned:</b> {j.assigned_worker_count ?? 0}</p><p><b>Workers still required:</b> {j.workers_needed ?? Math.max((j.worker_count || 1) - (j.assigned_worker_count || 0), 0)}</p>{(j.assigned_workers || []).length > 0 && <div className="assigned-workers-list"><b>Assigned workers:</b><ul>{j.assigned_workers.map(worker => <li key={worker.worker_id}>{worker.worker_name} <span className="dash-muted">({worker.assignment_status.replaceAll('_', ' ')})</span></li>)}</ul></div>}<p><b>Location:</b> {j.service_location}</p><div className="dash-actions">{j.status === 'open' && <button className="dash-primary" onClick={() => showApplications(j.id)}>View applications</button>}{j.status === 'in_progress' && <button className="dash-primary" onClick={() => changeStatus(j.id, 'completed')}>Confirm completion</button>}{j.status === 'in_progress' && <button className="dash-secondary" onClick={() => changeStatus(j.id, 'cancelled')}>Request / acknowledge cancellation</button>}{['open', 'assigned'].includes(j.status) && <button className="dash-secondary" onClick={() => setCancelJobTarget({ id: j.id, title: j.title })}>Cancel job</button>}</div></article>)}{!mine.length && <Empty text="You have not posted any jobs yet. Use “Post a job” to get started." />}</div>}

    {section === 'applications' && user.role === 'customer' && <div className="dash-grid">{Object.entries(applications).map(([jobId, list]) => <article className="dash-card" key={jobId}><h3>{mine.find(job => String(job.id) === String(jobId))?.title || `Job #${jobId}`}</h3>{list.map(a => <div className="application-row" key={a.id}><b>{a.worker_name}</b><p>{a.bio || 'Worker profile'} · {(a.skills || []).join(', ')}</p><p>Offer: {money(a.proposed_price)} · {a.experience_years || 0} years experience</p><p>{a.message || 'No message added.'}</p><span className="status-pill">{a.status}</span>{a.status === 'pending' && <button className="dash-primary" onClick={() => accept(jobId, a.id)}>Accept worker</button>}</div>)}</article>)}{!Object.keys(applications).length && <Empty text="Open “My jobs” and choose “View applications” to review applicants." />}</div>}

    {section === 'mywork' && user.role === 'worker' && <div className="dash-grid">{assignments.filter(a => !['completed', 'cancelled'].includes(a.assignment_status)).map(a => <article className="dash-card" key={a.assignment_id}><span className="status-pill">{a.assignment_status.replaceAll('_', ' ')}</span><h3>{a.title}</h3><p>{a.description}</p><p><b>Customer:</b> {a.customer_name}</p><p><b>Location:</b> {a.service_location}</p>{a.worker_completed_at && <p className="dash-muted">You confirmed completion; waiting for customer.</p>}{a.customer_completed_at && <p className="dash-muted">Customer confirmed completion; waiting for you.</p>}{a.cancellation_requested_at && <p className="dash-muted">Cancellation requested; the other party must acknowledge it.</p>}<div className="dash-actions">{a.assignment_status === 'accepted' && <button className="dash-primary" onClick={() => changeStatus(a.job_id, 'in_progress')}>Start work</button>}{['accepted', 'in_progress'].includes(a.assignment_status) && <button className="dash-primary" onClick={() => changeStatus(a.job_id, 'completed')} disabled={Boolean(a.worker_completed_at)}>Confirm completion</button>}{a.job_status === 'in_progress' && <button className="dash-secondary" onClick={() => changeStatus(a.job_id, 'cancelled')}>{a.cancellation_requested_at ? 'Acknowledge cancellation' : 'Request cancellation'}</button>}</div></article>)}{!assignments.filter(a => !['completed', 'cancelled'].includes(a.assignment_status)).length && <Empty text="You have no active assignments. Apply to an open job to get started." />}</div>}

    {section === 'profile' && user.role === 'worker' && <form className="dash-form" onSubmit={saveProfile}><h2>Your worker profile</h2><p>A complete profile helps customers understand your experience and service area.</p><label>About you<textarea rows="4" maxLength="4000" spellCheck="true" value={profile.bio} onChange={e => setProfile({ ...profile, bio: capitalizeText(e.target.value) })} onBlur={e => e.target.value && setProfile(p => ({ ...p, bio: capitalizeText(e.target.value) }))} /></label><label>Skills (comma-separated)<input spellCheck="true" value={Array.isArray(profile.skills) ? profile.skills.join(', ') : profile.skills} onChange={e => setProfile({ ...profile, skills: capitalizeText(e.target.value) })} onBlur={e => e.target.value && setProfile(p => ({ ...p, skills: capitalizeText(e.target.value) }))} placeholder="Plumbing, cleaning, electrical work" /></label><label>Years of experience<input type="number" min="0" max="60" value={profile.experienceYears} onChange={e => setProfile({ ...profile, experienceYears: e.target.value })} /></label><label>Service area<input maxLength="160" spellCheck="true" value={profile.serviceArea} onChange={e => setProfile({ ...profile, serviceArea: capitalizeText(e.target.value) })} onBlur={e => e.target.value && setProfile(p => ({ ...p, serviceArea: capitalizeText(e.target.value) }))} placeholder="Your locality or service area" /></label><label>Hourly rate in INR<input type="number" min="0" step="0.01" value={profile.hourlyRate} onChange={e => setProfile({ ...profile, hourlyRate: e.target.value })} /></label><label>Availability<select value={profile.availabilityStatus} onChange={e => setProfile({ ...profile, availabilityStatus: e.target.value })}><option value="available">Available for jobs</option><option value="busy">Busy</option><option value="unavailable">Unavailable</option></select></label><button className="dash-primary" type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save profile'}</button></form>}

    {section === 'notifications' && <div className="dash-grid">{notifications.map(n => <article className="dash-card" key={n.id}><div className="notification-heading"><h3>{n.title}</h3>{!n.read_at && <span className="status-pill available">New</span>}</div><p>{n.message}</p>{n.related_job_id && <><p><b>Related job:</b> {n.job_title || "Job details"}</p>{user.role === 'customer' && <>{user.role === 'customer' && <>{n.workers_requested != null && <p><b>Workers requested:</b> {n.workers_requested}</p>}{n.workers_assigned != null && <p><b>Workers assigned:</b> {n.workers_assigned}</p>}{n.workers_still_required != null && <p><b>Workers still required:</b> {n.workers_still_required}</p>}</> }</>}<button className="dash-secondary" type="button" onClick={() => setExpandedNotificationId(current => String(current) === String(n.id) ? null : String(n.id))}>{String(expandedNotificationId) === String(n.id) ? 'Hide job details' : 'View job details'}</button>{String(expandedNotificationId) === String(n.id) && <div className="notification-job-details">{n.job_category && <p><b>Category:</b> {n.job_category}</p>}{n.job_location && <p><b>Location:</b> {n.job_location}</p>}{n.job_description && <p><b>Description:</b> {n.job_description}</p>}{n.job_status && <p><b>Job status:</b> {n.job_status.replaceAll('_', ' ')}</p>}</div>}</>}{!n.related_job_id && <p className="dash-muted">No specific job is linked to this notification.</p>}<p className="dash-muted">{new Date(n.created_at).toLocaleString()}</p>{!n.read_at && <button className="dash-secondary" type="button" onClick={() => markRead(n.id)}>Mark as read</button>}</article>)}{!notifications.length && <Empty text="You’re all caught up. Notifications will appear here." />}</div>}
    {cancelJobTarget && <div className="confirmation-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setCancelJobTarget(null) }}><section className="confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-job-title"><h2 id="cancel-job-title"><span style={{ marginRight: "0.25em" }}>Cancel</span><span style={{ marginRight: "0.25em" }}>this</span><span>job?</span></h2><p>Are you sure you want to cancel this job?</p><div className="confirmation-actions"><button type="button" className="dash-secondary" onClick={() => setCancelJobTarget(null)}>No, keep it</button><button type="button" className="confirmation-danger" disabled={loading} onClick={async () => { const target = cancelJobTarget; await changeStatus(target.id, 'cancelled'); setCancelJobTarget(null) }}>Yes, cancel</button></div></section></div>}
  </section>
}

function capitalizeText(value) {
  return String(value).replace(/(^|[.!?]\s+|\n\s*|,\s*)([a-z])/g, (match, boundary, letter) => boundary + letter.toUpperCase())
}

function jobMatchesSearch(job, search) {
  const query = search.trim().toLowerCase()
  if (!query) return true
  const searchable = `${job.title || ''} ${job.description || ''} ${job.category || ''}`.toLowerCase()
  if (searchable.includes(query)) return true
  // Common spelling variants should still find the Carpentry category.
  const carpentryTerms = ['carpentry', 'carpenter', 'carpentary', 'carpentar']
  if (carpentryTerms.includes(query)) return /carpentry|carpenter/i.test(searchable)
  return false
}

function Empty({ text }) { return <div className="dash-empty"><span>✳</span><p>{text}</p></div> }
