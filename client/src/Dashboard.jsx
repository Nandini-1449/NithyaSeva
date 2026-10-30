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
  const [jobForm, setJobForm] = useState({ title: '', description: '', category: 'Household services', serviceLocation: '', exactAddress: '', budget: '', workerCount: '1' })
  const [applyForm, setApplyForm] = useState({ jobId: '', proposedPrice: '', message: '' })
  const [cancelJobTarget, setCancelJobTarget] = useState(null)
  const [selectedDetail, setSelectedDetail] = useState(null)
  const [phase5, setPhase5] = useState({ payments: [], entries: [], totals: {}, disputes: [] })
  const [paymentWorkerId, setPaymentWorkerId] = useState('')
  const [trustForm, setTrustForm] = useState({ jobId: '', amount: '', paymentMethod: 'cash', rating: '5', comment: '', reason: 'Work quality', description: '' })

  const request = useCallback(async (path, options = {}) => {
    const token = localStorage.getItem('nithyaseva_token')
    const response = await fetch(API + path, {
      ...options,
      headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(options.headers || {}) },
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

  const loadPhase5 = useCallback(async () => {
    try {
      const [payments, disputes, ledger] = await Promise.all([
        request('/payments/mine'), request('/disputes/mine'),
        user.role === 'worker' ? request('/ledger/mine') : Promise.resolve({ entries: [], totals: {} })
      ])
      setPhase5({ payments: payments.payments || [], disputes: disputes.disputes || [], entries: ledger.entries || [], totals: ledger.totals || {} })
    } catch (e) { setError(e.message) }
  }, [request, user.role])
  useEffect(() => { if (section === 'trust') loadPhase5() }, [section, loadPhase5])

  async function submitTrustAction(path, body, success) {
    const ok = await act(() => request(path, { method: 'POST', body: JSON.stringify(body) }), success)
    if (ok) { await loadPhase5(); setTrustForm({ jobId: '', amount: '', paymentMethod: 'cash', rating: '5', comment: '', reason: 'Work quality', description: '' }) }
  }

  async function startDemoPayment(e) {
    e.preventDefault()
    const saved = await act(
      () => request('/jobs/' + trustForm.jobId + '/payments/demo', {
        method: 'POST',
        body: JSON.stringify({ workerId: Number(paymentWorkerId), amount: Number(trustForm.amount) })
      }),
      'Demo payment recorded successfully. No real money was transferred.'
    )
    if (saved) setPaymentWorkerId('')
  }

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
    setJobForm({ title: '', description: '', category: 'Household services', serviceLocation: '', exactAddress: '', budget: '', workerCount: '1' })
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
  const tabs = user.role === 'admin'
    ? [['trust', 'Dispute management']]
    : user.role === 'customer'
      ? [['workers', 'Find workers'], ['post', 'Post a job'], ['myjobs', 'My jobs'], ['applications', 'Applications'], ['trust', 'Payments & reviews'], ['notifications', 'Notifications']]
      : [['jobs', 'Find jobs'], ['mywork', 'My work'], ['profile', 'My profile'], ['trust', 'Earnings & trust'], ['notifications', 'Notifications']]

  return <section className="dashboard">
    <div className="dashboard-heading">
      <div><p className="dash-eyebrow">YOUR NITHYASEVA WORKSPACE</p><h1>Hello, <span>{user.full_name || 'there'}</span></h1><p>Manage opportunities, work, and your account from one place.</p></div>
      <button className="dash-refresh" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : '↻ Refresh'}</button>
    </div>
    <div className="dash-tabs">{tabs.map(([id, label]) => <button key={id} className={section === id ? 'selected' : ''} onClick={() => setSection(id)}>{label}</button>)}</div>
    {message && <div className="dash-alert good" role="status">{message}</div>}
    {error && <div className="dash-alert bad" role="alert">{error}</div>}
    {loading && <p className="dash-muted">Loading your latest information…</p>}

    {section === 'workers' && user.role === 'customer' && <div className="dash-grid listing-row">{workers.filter(w => !search || (w.full_name + ' ' + (w.skills || []).join(' ') + ' ' + (w.service_area || '')).toLowerCase().includes(search.toLowerCase())).map(w => <article className="dash-card listing-card" key={w.id} role="button" tabIndex={0} onClick={() => setSelectedDetail({ type: 'worker', item: w })} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedDetail({ type: 'worker', item: w }) } }}><div className="dash-card-icon">✦</div><h3>{w.full_name}</h3><p>{w.bio || 'Skilled local service professional'}</p><p><b>Skills:</b> {(w.skills || []).join(', ') || 'Not added yet'}</p><p><b>Area:</b> {w.service_area || 'Not specified'}</p><p><b>Experience:</b> {w.experience_years || 0} years</p><p><b>Rate:</b> {money(w.hourly_rate)}</p><span className={'status-pill ' + (w.availability_status === 'available' ? 'available' : '')}>{w.availability_status || 'unavailable'}</span></article>)}{!workers.length && <Empty text="No worker profiles yet. Check back after workers complete their profiles." />}</div>}

    {section === 'jobs' && user.role === 'worker' && <><div className="job-discovery-controls"><label>Search jobs<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by title, description or category" /></label><div className="job-discovery-actions"><button type="button" className={jobLocationMode === 'all' ? 'dash-primary' : 'dash-secondary'} onClick={() => { setJobLocationMode('all'); setMessage('Showing all open jobs.'); setError('') }}>All Jobs</button><button type="button" className={jobLocationMode === 'nearby' ? 'dash-primary' : 'dash-secondary'} onClick={enableNearbyJobs}>Near Me</button><label>Distance<select value={nearbyRadius} onChange={e => setNearbyRadius(e.target.value)}><option value="5">Within 5 km</option><option value="10">Within 10 km</option><option value="25">Within 25 km</option><option value="50">Within 50 km</option><option value="100">Within 100 km</option><option value="200">Within 200 km</option></select></label></div>{jobLocationMode === 'nearby' && !currentCoordinates && <p className="dash-muted">Choose Near Me to share your location for distance filtering.</p>}</div><div className="dash-grid listing-row">{jobs.filter(j => jobMatchesSearch(j, search)).map(j => <article className="dash-card listing-card" key={j.id} role="button" tabIndex={0} onClick={() => setSelectedDetail({ type: 'job', item: j })} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedDetail({ type: 'job', item: j }) } }}><span className="status-pill">{j.status}</span><h3>{j.title}</h3><p>{j.description}</p><p><b>Category:</b> {j.category}</p><p><b>Location:</b> {j.service_location}</p>{j.distance_km != null && <p><b>Distance:</b> {j.distance_km} km away</p>}<p><b>Budget:</b> {money(j.budget)}</p><p className="dash-muted">Posted by {j.customer_name || 'Customer'} · {new Date(j.created_at).toLocaleDateString()}</p>{user.role === 'worker' && (applyForm.jobId === String(j.id) ? <form className="dash-form application-form" onSubmit={e => submitApplication(e, j.id)}><h4>Apply for this job</h4><label>Proposed price in INR (optional)<input type="number" min="0" step="0.01" value={applyForm.proposedPrice} onChange={e => setApplyForm({ ...applyForm, proposedPrice: e.target.value })} placeholder="Leave blank to use the customer budget" /></label><label>Short message to the customer (optional)<textarea rows="3" maxLength="1500" spellCheck="true" value={applyForm.message} onChange={e => setApplyForm({ ...applyForm, message: capitalizeText(e.target.value) })} onBlur={e => e.target.value && setApplyForm(f => ({ ...f, message: capitalizeText(e.target.value) }))} placeholder="Describe how you can help with this job" /></label><div className="application-form-actions"><button className="dash-primary" type="submit" disabled={loading}>Send application</button><button className="dash-secondary" type="button" onClick={() => setApplyForm({ jobId: '', proposedPrice: '', message: '' })}>Cancel</button></div></form> : <button className="dash-primary" onClick={e => { e.stopPropagation(); apply(j.id) }}>Apply for this job ↗</button>)}</article>)}{!jobs.length && <Empty text={jobLocationMode === 'nearby' ? 'No jobs with saved coordinates were found within this distance. Try a larger distance or All Jobs.' : 'No open jobs at the moment. Please check back later.'} />}</div></>}

    {section === 'post' && user.role === 'customer' && <form className="dash-form" onSubmit={createJob}><h2>Post a new job</h2><p>Describe the work clearly so workers can decide whether to apply.</p><label>Job title<input required maxLength="160" spellCheck="true" value={jobForm.title} onChange={e => setJobForm({ ...jobForm, title: capitalizeText(e.target.value) })} onBlur={e => e.target.value && setJobForm(f => ({ ...f, title: capitalizeText(e.target.value) }))} placeholder="e.g. Repair a leaking kitchen tap" /></label><label>Category<select required value={jobForm.category} onChange={e => setJobForm({ ...jobForm, category: e.target.value })}>{['Household services','Society / apartment services','Construction and building work','Plumbing','Electrical work','Cleaning and housekeeping','Painting','Carpentry','Gardening and outdoor work','Moving and loading','Security services','Elderly care and assistance','Other services'].map(category => <option key={category} value={category}>{category}</option>)}</select></label><label>Work description<textarea required maxLength="10000" rows="4" spellCheck="true" value={jobForm.description} onChange={e => setJobForm({ ...jobForm, description: capitalizeText(e.target.value) })} onBlur={e => e.target.value && setJobForm(f => ({ ...f, description: capitalizeText(e.target.value) }))} /></label><label>Service location (area/locality)<input required maxLength="1000" spellCheck="true" value={jobForm.serviceLocation} onChange={e => setJobForm({ ...jobForm, serviceLocation: capitalizeText(e.target.value) })} onBlur={e => e.target.value && setJobForm(f => ({ ...f, serviceLocation: capitalizeText(e.target.value) }))} placeholder="e.g. Kukatpally, Hyderabad" /></label><label>Exact job address (private)<textarea required maxLength="2000" rows="3" spellCheck="true" value={jobForm.exactAddress} onChange={e => setJobForm({ ...jobForm, exactAddress: e.target.value })} placeholder="House/flat number, street, landmark and full address" /></label><p className="dash-muted">Your exact address stays private. Assigned workers can see it only after the requested team is complete and you approve sharing.</p><div className="optional-location"><button type="button" className="dash-secondary" onClick={enableNearbyJobs}>{currentCoordinates ? '✓ Location attached for nearby search' : 'Optional: use my location for nearby search'}</button><p className="dash-muted">Only approximate coordinates supplied by your browser are saved with this job. You can skip this.</p></div><label>Number of workers needed<input required type="number" min="1" max="10000" step="1" value={jobForm.workerCount} onChange={e => setJobForm({ ...jobForm, workerCount: e.target.value })} /></label><label>Budget in INR (optional)<input type="number" min="0" step="0.01" value={jobForm.budget} onChange={e => setJobForm({ ...jobForm, budget: e.target.value })} /></label><button className="dash-primary" disabled={loading}>Publish job</button></form>}

    {section === 'myjobs' && user.role === 'customer' && <div className="dash-grid">{mine.map(j => {
      const workers = j.assigned_workers || [];
      const jobIsActive = !['completed', 'cancelled'].includes(j.status);
      const pendingWorkerCompletion = jobIsActive && workers.some(w => w.worker_completed_at && !w.customer_completed_at && !['completed', 'cancelled'].includes(w.assignment_status));
      const pendingCancellation = jobIsActive && workers.some(w => w.cancellation_requested_at && !w.cancellation_acknowledged_at && !['completed', 'cancelled'].includes(w.assignment_status) && String(w.cancellation_requested_by) !== String(user.id));
      const ownCancellation = jobIsActive && workers.some(w => w.cancellation_requested_at && !w.cancellation_acknowledged_at && !['completed', 'cancelled'].includes(w.assignment_status) && String(w.cancellation_requested_by) === String(user.id));
      return <article className="dash-card" key={j.id}>
        <span className="status-pill">{j.status.replaceAll('_', ' ')}</span><h3>{j.title}</h3><p>{j.description}</p>
        <p><b>Budget:</b> {money(j.budget)}</p><p><b>Workers requested:</b> {j.worker_count || 1}</p><p><b>Workers assigned:</b> {j.assigned_worker_count ?? 0}</p><p><b>Area:</b> {j.service_location}</p>
        {workers.length > 0 && <div className="assigned-workers-list"><b>Assigned workers and progress</b><ul>{workers.map(w => <li key={w.worker_id}><b>{w.worker_name}</b> — {w.assignment_status.replaceAll('_', ' ')}{w.worker_completed_at ? ' · Worker confirmed' : ''}{w.customer_completed_at ? ' · Customer confirmed' : ''}{['accepted','in_progress'].includes(w.assignment_status) ? <form className="inline-rate-form" onSubmit={e => { e.preventDefault(); const value = new FormData(e.currentTarget).get('agreedPrice'); act(() => request('/jobs/' + j.id + '/workers/' + w.worker_id + '/rate', { method:'PATCH', body:JSON.stringify({ agreedPrice:Number(value) }) }), 'Agreed rate saved.') }}><label>Agreed price (₹)<input name="agreedPrice" type="number" min="0" step="0.01" defaultValue={w.agreed_price ?? ''} required /></label><button type="submit" className="dash-secondary">Save rate</button></form> : <p><b>Agreed price:</b> {w.agreed_price != null ? money(w.agreed_price) : 'Not set before completion'}</p>}</li>)}</ul></div>}
        <WorkPhotos jobId={j.id} user={user} request={request} mode="customer" />
        {!jobIsActive && <p className="job-closed-note">Job is completed and canceled.</p>}
        {jobIsActive && <section className="dash-alert"><b>Job completion and cancellation</b>
          {pendingWorkerCompletion && <p>A worker has confirmed completion. Review the before/after photos and confirm the work.</p>}
          {pendingCancellation && <p>A worker requested cancellation. Acknowledge it below to release that worker.</p>}
          {ownCancellation && <p>Your cancellation request is waiting for the worker's acknowledgement.</p>}

          <div className="dash-actions">
            {pendingWorkerCompletion && <button type="button" className="dash-primary" onClick={() => changeStatus(j.id, 'completed')}>Confirm completion</button>}
            {pendingCancellation && <button type="button" className="dash-secondary" onClick={() => changeStatus(j.id, 'cancelled')}>Acknowledge cancellation</button>}
            {jobIsActive && j.status === 'in_progress' && !pendingCancellation && !ownCancellation && <button type="button" className="dash-secondary" onClick={() => changeStatus(j.id, 'cancelled')}>Request cancellation</button>}
          </div>
        </section>}
        {jobIsActive && (j.assigned_worker_count ?? 0) >= (j.worker_count || 1) ? <div className="dash-alert good"><p>Required team is complete. {j.contact_sharing_approved_at ? 'Contact details are shared.' : 'Approve sharing so assigned workers can see your exact address and phone number.'}</p><button type="button" className={j.contact_sharing_approved_at ? 'dash-secondary' : 'dash-primary'} onClick={() => act(() => request('/jobs/' + j.id + '/share-contact', { method: 'PATCH', body: JSON.stringify({ approved: !j.contact_sharing_approved_at }) }), j.contact_sharing_approved_at ? 'Contact sharing revoked.' : 'Contact details shared with assigned workers.')}>{j.contact_sharing_approved_at ? 'Revoke contact sharing' : 'Approve sharing contact and location'}</button></div> : null}
        {jobIsActive && <div className="dash-actions">{j.status === 'open' && <button type="button" className="dash-primary" onClick={() => showApplications(j.id)}>View applications</button>}{['open', 'assigned', 'accepted'].includes(j.status) && <button type="button" className="dash-secondary" onClick={() => setCancelJobTarget({ id: j.id, title: j.title })}>Cancel job</button>}</div>}
      </article>
    })}{!mine.length && <Empty text="You have not posted any jobs yet. Use “Post a job” to get started." />}</div>}

    {section === 'applications' && user.role === 'customer' && <div className="dash-grid">{Object.entries(applications).map(([jobId, list]) => <article className="dash-card" key={jobId}><h3>{mine.find(job => String(job.id) === String(jobId))?.title || `Job #${jobId}`}</h3>{list.map(a => <div className="application-row" key={a.id}><b>{a.worker_name}</b><p>{a.bio || 'Worker profile'} · {(a.skills || []).join(', ')}</p><p>Offer: {money(a.proposed_price)} · {a.experience_years || 0} years experience</p><p>{a.message || 'No message added.'}</p><span className="status-pill">{a.status}</span>{a.status === 'pending' && <button className="dash-primary" onClick={() => accept(jobId, a.id)}>Accept worker</button>}</div>)}</article>)}{!Object.keys(applications).length && <Empty text="Open “My jobs” and choose “View applications” to review applicants." />}</div>}

    {section === 'mywork' && user.role === 'worker' && <div className="dash-grid">{assignments.filter(a => !['completed', 'cancelled'].includes(a.assignment_status)).map(a => <article className="dash-card" key={a.assignment_id}><span className="status-pill">{a.assignment_status.replaceAll('_', ' ')}</span><h3>{a.title}</h3><p>{a.description}</p><p><b>Customer:</b> {a.customer_name}</p><p><b>Area:</b> {a.service_location}</p>{a.contact_details_shared ? <div className="dash-alert good"><p><b>Exact job address:</b> {a.exact_address}</p><p><b>Customer phone:</b> {a.customer_phone || 'Not provided'}</p></div> : <p className="dash-muted">Exact address and phone appear after the customer approves contact sharing.</p>}<section className="dash-alert"><b>Work progress actions</b><p>{a.worker_completed_at ? 'You have confirmed completion. Waiting for the customer.' : a.assignment_status === 'accepted' ? 'Start the job when you begin work. Upload before and after photos before confirming completion.' : 'Upload before and after photos, then confirm completion.'}</p><div className="dash-actions">{a.assignment_status === 'accepted' && <button type="button" className="dash-primary" onClick={() => changeStatus(a.job_id, 'in_progress')}>Start work</button>}{['accepted', 'in_progress'].includes(a.assignment_status) && <button type="button" className="dash-primary" onClick={() => changeStatus(a.job_id, 'completed')} disabled={Boolean(a.worker_completed_at)}>{a.worker_completed_at ? 'Completion confirmed' : 'Confirm completion'}</button>}{a.job_status === 'in_progress' && <button type="button" className="dash-secondary" onClick={() => changeStatus(a.job_id, 'cancelled')} disabled={Boolean(a.cancellation_requested_at && String(a.cancellation_requested_by) === String(user.id))}>{!a.cancellation_requested_at ? 'Request cancellation' : String(a.cancellation_requested_by) === String(user.id) ? 'Waiting for customer acknowledgement' : 'Acknowledge cancellation'}</button>}</div></section><WorkPhotos jobId={a.job_id} user={user} request={request} mode="worker" /></article>)}{!assignments.filter(a => !['completed', 'cancelled'].includes(a.assignment_status)).length && <Empty text="You have no active assignments. Apply to an open job to get started." />}</div>}

    {section === 'profile' && user.role === 'worker' && <form className="dash-form" onSubmit={saveProfile}><h2>Your worker profile</h2><p>A complete profile helps customers understand your experience and service area.</p><label>About you<textarea rows="4" maxLength="4000" spellCheck="true" value={profile.bio} onChange={e => setProfile({ ...profile, bio: capitalizeText(e.target.value) })} onBlur={e => e.target.value && setProfile(p => ({ ...p, bio: capitalizeText(e.target.value) }))} /></label><label>Skills (comma-separated)<input spellCheck="true" value={Array.isArray(profile.skills) ? profile.skills.join(', ') : profile.skills} onChange={e => setProfile({ ...profile, skills: capitalizeText(e.target.value) })} onBlur={e => e.target.value && setProfile(p => ({ ...p, skills: capitalizeText(e.target.value) }))} placeholder="Plumbing, cleaning, electrical work" /></label><label>Years of experience<input type="number" min="0" max="60" value={profile.experienceYears} onChange={e => setProfile({ ...profile, experienceYears: e.target.value })} /></label><label>Service area<input maxLength="160" spellCheck="true" value={profile.serviceArea} onChange={e => setProfile({ ...profile, serviceArea: capitalizeText(e.target.value) })} onBlur={e => e.target.value && setProfile(p => ({ ...p, serviceArea: capitalizeText(e.target.value) }))} placeholder="Your locality or service area" /></label><label>Hourly rate in INR<input type="number" min="0" step="0.01" value={profile.hourlyRate} onChange={e => setProfile({ ...profile, hourlyRate: e.target.value })} /></label><label>Availability<select value={profile.availabilityStatus} onChange={e => setProfile({ ...profile, availabilityStatus: e.target.value })}><option value="available">Available for jobs</option><option value="busy">Busy</option><option value="unavailable">Unavailable</option></select></label><button className="dash-primary" type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save profile'}</button></form>}


    {section === 'trust' && <div className="dash-grid">
      <article className="dash-card"><h2>{user.role === 'worker' ? 'Worker earnings ledger' : 'Payment records'}</h2>
        {user.role === 'worker' && <><p><b>Recorded received:</b> {money(phase5.totals.received || 0)}</p><p><b>Pending records:</b> {money(phase5.totals.pending || 0)}</p></>}
        {(user.role === 'worker' ? phase5.entries : phase5.payments).map(p => <div className="application-row" key={p.id}><b>{p.title || ('Job #' + p.job_id)}</b><p>{money(p.amount)} · {p.status} · {p.payment_method || 'Not specified'}</p><p className="dash-muted">{new Date(p.created_at).toLocaleString()}</p></div>)}
        {!(user.role === 'worker' ? phase5.entries : phase5.payments).length && <p className="dash-muted">No payment records yet.</p>}
      </article>
      {user.role === 'customer' && <article className="dash-card"><h3>Record an offline payment</h3><p className="dash-muted">This creates a pending bookkeeping entry only. It does not transfer money or verify a real payment.</p><form className="dash-form" onSubmit={e => { e.preventDefault(); submitTrustAction('/jobs/' + trustForm.jobId + '/payments', { amount: Number(trustForm.amount), paymentMethod: trustForm.paymentMethod }, 'Pending payment record saved.') }}>
        <label>Completed job<select required value={trustForm.jobId} onChange={e => setTrustForm({...trustForm,jobId:e.target.value})}><option value="">Choose a completed job</option>{mine.filter(j => j.status === 'completed').map(j => <option key={j.id} value={j.id}>{j.title} (#{j.id})</option>)}</select></label>
        <label>Amount (₹)<input required type="number" min="0.01" step="0.01" value={trustForm.amount} onChange={e => setTrustForm({...trustForm,amount:e.target.value})}/></label>
        <label>Method<select value={trustForm.paymentMethod} onChange={e => setTrustForm({...trustForm,paymentMethod:e.target.value})}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="upi">UPI (record only)</option><option value="other">Other</option></select></label><button className="dash-primary">Save pending record</button></form></article>}
      {user.role === 'customer' && <article className="dash-card"><h3>Online Payment Demo</h3><p className="dash-muted">Presentation simulation only. This records a demo payment as pending; no payment gateway is connected and no real money is transferred.</p><form className="dash-form" onSubmit={startDemoPayment}>
        <label>Completed job<select required value={trustForm.jobId} onChange={e => { setTrustForm({...trustForm,jobId:e.target.value}); setPaymentWorkerId('') }}><option value="">Choose a completed job</option>{mine.filter(j => j.status === 'completed').map(j => <option key={j.id} value={j.id}>{j.title} (#{j.id})</option>)}</select></label>
        <label>Worker<select required value={paymentWorkerId} onChange={e => setPaymentWorkerId(e.target.value)}><option value="">Choose worker</option>{(mine.find(j => String(j.id) === String(trustForm.jobId))?.assigned_workers || []).filter(w => w.assignment_status === 'completed').map(w => <option key={w.worker_id} value={w.worker_id}>{w.worker_name}</option>)}</select></label>
        <label>Amount (₹)<input required type="number" min="0.01" step="0.01" value={trustForm.amount} onChange={e => setTrustForm({...trustForm,amount:e.target.value})}/></label>
        <button className="dash-primary" type="submit">Simulate online payment</button></form></article>}
      <article className="dash-card"><h3>Submit a review</h3><p className="dash-muted">Reviews are allowed after a completed job, once per participant.</p><form className="dash-form" onSubmit={e => { e.preventDefault(); submitTrustAction('/jobs/' + trustForm.jobId + '/reviews', { rating:Number(trustForm.rating), comment:trustForm.comment }, 'Review submitted.') }}>
        <label>Completed job<select required value={trustForm.jobId} onChange={e => setTrustForm({...trustForm,jobId:e.target.value})}><option value="">Choose a completed job</option>{(user.role === 'customer' ? mine.filter(j => j.status === 'completed') : assignments.filter(a => a.job_status === 'completed')).map(j => <option key={j.id || j.job_id} value={j.id || j.job_id}>{j.title} (#{j.id || j.job_id})</option>)}</select></label>
        <label>Rating<select value={trustForm.rating} onChange={e => setTrustForm({...trustForm,rating:e.target.value})}>{[5,4,3,2,1].map(n => <option key={n} value={n}>{n} / 5</option>)}</select></label>
        <label>Comment (optional)<textarea maxLength="2000" value={trustForm.comment} onChange={e => setTrustForm({...trustForm,comment:e.target.value})}/></label><button className="dash-primary">Submit review</button></form></article>
      <article className="dash-card"><h3>Raise a dispute</h3><form className="dash-form" onSubmit={e => { e.preventDefault(); submitTrustAction('/jobs/' + trustForm.jobId + '/disputes', { reason:trustForm.reason, description:trustForm.description }, 'Dispute submitted for review.') }}>
        <label>Job<select required value={trustForm.jobId} onChange={e => setTrustForm({...trustForm,jobId:e.target.value})}><option value="">Choose a job</option>{(user.role === 'customer' ? mine : assignments).map(j => <option key={j.id || j.job_id} value={j.id || j.job_id}>{j.title} (#{j.id || j.job_id})</option>)}</select></label>
        <label>Reason<select value={trustForm.reason} onChange={e => setTrustForm({...trustForm,reason:e.target.value})}>{['Work quality','Payment disagreement','Work not completed','Schedule issue','Communication','Other'].map(x => <option key={x}>{x}</option>)}</select></label>
        <label>Details (10–5,000 characters)<textarea required minLength="10" maxLength="5000" value={trustForm.description} onChange={e => setTrustForm({...trustForm,description:e.target.value})}/></label><button className="dash-primary">Submit dispute</button></form>
      </article>
      <article className="dash-card"><h3>{user.role === 'admin' ? 'All disputes' : 'My disputes'}</h3>{phase5.disputes.map(d => <div className="application-row" key={d.id}><b>{d.title} · {d.status}</b><p>{d.reason}: {d.description}</p><p className="dash-muted">Opened by {d.opened_by_name} · Against {d.against_name}</p>{d.resolution && <p><b>Resolution:</b> {d.resolution}</p>}{user.role === 'admin' && <div className="dash-actions"><button type="button" className="dash-secondary" onClick={() => act(() => request('/admin/disputes/' + d.id, {method:'PATCH',body:JSON.stringify({status:'under_review'})}), 'Dispute moved to review.')}>Mark under review</button><button type="button" className="dash-primary" onClick={() => { const note = window.prompt('Enter the resolution note (at least 5 characters):'); if (note && note.trim().length >= 5) act(() => request('/admin/disputes/' + d.id, {method:'PATCH',body:JSON.stringify({status:'resolved',resolution:note.trim()})}), 'Dispute resolved.') }}>Resolve dispute</button></div>}</div>)}{!phase5.disputes.length && <p className="dash-muted">No disputes to display.</p>}</article>
    </div>}

    {section === 'notifications' && <div className="dash-grid">{notifications.map(n => <article className="dash-card" key={n.id}><div className="notification-heading"><h3>{n.title}</h3>{!n.read_at && <span className="status-pill available">New</span>}</div><p>{n.message}</p>{n.related_job_id && <><p><b>Related job:</b> {n.job_title || "Job details"}</p>{user.role === 'customer' && <>{user.role === 'customer' && <>{n.workers_requested != null && <p><b>Workers requested:</b> {n.workers_requested}</p>}{n.workers_assigned != null && <p><b>Workers assigned:</b> {n.workers_assigned}</p>}{n.workers_still_required != null && <p><b>Workers still required:</b> {n.workers_still_required}</p>}</> }</>}<button className="dash-secondary" type="button" onClick={() => setExpandedNotificationId(current => String(current) === String(n.id) ? null : String(n.id))}>{String(expandedNotificationId) === String(n.id) ? 'Hide job details' : 'View job details'}</button>{String(expandedNotificationId) === String(n.id) && <div className="notification-job-details">{n.job_category && <p><b>Category:</b> {n.job_category}</p>}{n.job_location && <p><b>Location:</b> {n.job_location}</p>}{n.job_description && <p><b>Description:</b> {n.job_description}</p>}{n.job_status && <p><b>Job status:</b> {n.job_status.replaceAll('_', ' ')}</p>}</div>}</>}{!n.related_job_id && <p className="dash-muted">No specific job is linked to this notification.</p>}<p className="dash-muted">{new Date(n.created_at).toLocaleString()}</p>{!n.read_at && <button className="dash-secondary" type="button" onClick={() => markRead(n.id)}>Mark as read</button>}</article>)}{!notifications.length && <Empty text="You’re all caught up. Notifications will appear here." />}</div>}
    {selectedDetail && <div className="confirmation-backdrop listing-detail-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setSelectedDetail(null) }}><section className="confirmation-dialog listing-detail" role="dialog" aria-modal="true" aria-labelledby="listing-detail-title"><button type="button" className="listing-detail-close" onClick={() => setSelectedDetail(null)} aria-label="Close details">×</button>{selectedDetail.type === 'worker' ? <><p className="dash-eyebrow">WORKER PROFILE</p><h2 id="listing-detail-title">{selectedDetail.item.full_name}</h2><p>{selectedDetail.item.bio || 'Skilled local service professional'}</p><p><b>Skills:</b> {(selectedDetail.item.skills || []).join(', ') || 'Not added yet'}</p><p><b>Service area:</b> {selectedDetail.item.service_area || 'Not specified'}</p><p><b>Experience:</b> {selectedDetail.item.experience_years || 0} years</p><p><b>Rate:</b> {money(selectedDetail.item.hourly_rate)}</p><p><b>Availability:</b> {selectedDetail.item.availability_status || 'Unavailable'}</p></> : <><p className="dash-eyebrow">JOB DETAILS</p><h2 id="listing-detail-title">{selectedDetail.item.title}</h2><p>{selectedDetail.item.description}</p><p><b>Category:</b> {selectedDetail.item.category}</p><p><b>Location:</b> {selectedDetail.item.service_location}</p>{selectedDetail.item.distance_km != null && <p><b>Distance:</b> {selectedDetail.item.distance_km} km away</p>}<p><b>Budget:</b> {money(selectedDetail.item.budget)}</p><p><b>Workers needed:</b> {selectedDetail.item.worker_count || 1}</p><p><b>Posted by:</b> {selectedDetail.item.customer_name || 'Customer'}</p><p><b>Posted on:</b> {new Date(selectedDetail.item.created_at).toLocaleDateString()}</p><button type="button" className="dash-primary" onClick={() => { apply(selectedDetail.item.id); setSelectedDetail(null) }}>Apply for this job ↗</button></>}</section></div>}
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


function WorkPhotos({ jobId, user, request, mode }) {
  const [photos, setPhotos] = useState([]);
  const [phase, setPhase] = useState('before');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    request('/work-proof/jobs/' + jobId + '/photos')
      .then(data => { if (active) { setPhotos(data.photos || []); setPhotoError(''); } })
      .catch(e => { if (active) setPhotoError(e.message); });
    return () => { active = false; };
  }, [jobId, request, reloadKey]);

  async function upload(e) {
    e.preventDefault();
    const formElement = e.currentTarget;
    if (!selected) return;
    setBusy(true); setPhotoError('');
    try {
      const form = new FormData();
      form.append('phase', phase);
      form.append('photo', selected);
      await request('/work-proof/jobs/' + jobId + '/photos', { method: 'POST', body: form });
      setSelected(null);
      formElement.reset();
      setReloadKey(k => k + 1);
    } catch (err) {
      setPhotoError(err.message || 'Could not upload photo.');
    } finally { setBusy(false); }
  }

  const [photoUrls, setPhotoUrls] = useState({});
  useEffect(() => {
    let active = true;
    const urls = [];
    async function loadImages() {
      const token = localStorage.getItem('nithyaseva_token');
      const entries = await Promise.all(photos.map(async photo => {
        try {
          const response = await fetch(API + '/work-proof/photos/' + photo.id, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
          if (!response.ok) throw new Error('Photo could not be loaded.');
          const url = URL.createObjectURL(await response.blob());
          urls.push(url);
          return [photo.id, url];
        } catch { return [photo.id, null]; }
      }));
      if (active) setPhotoUrls(Object.fromEntries(entries));
      else urls.forEach(URL.revokeObjectURL);
    }
    if (photos.length) loadImages(); else setPhotoUrls({});
    return () => { active = false; urls.forEach(URL.revokeObjectURL); };
  }, [photos]);

  return <section className="work-photos">
    <h4>Work photos</h4>
    {mode === 'worker' && <form className="dash-form" onSubmit={upload}>
      <label>Photo stage<select value={phase} onChange={e => setPhase(e.target.value)}><option value="before">Before work</option><option value="after">After work</option></select></label>
      <label>Choose photo<input type="file" accept="image/jpeg,image/png,image/webp" required onChange={e => setSelected(e.target.files?.[0] || null)} /></label>
      <p className="dash-muted">Use JPG, PNG or WebP images up to 5 MB. Upload only photos relevant to this job.</p>
      <button className="dash-primary" type="submit" disabled={busy || !selected}>{busy ? 'Uploading…' : 'Upload work photo'}</button>
    </form>}
    {photoError && <p className="dash-alert bad" role="alert">{photoError}</p>}
    {['before','after'].map(stage => <div key={stage}>
      <h5>{stage === 'before' ? 'Before work' : 'After work'}</h5>
      <div className="dash-grid">{photos.filter(p => p.phase === stage).map(photo => <article className="dash-card" key={photo.id}>
        <p>{photo.worker_name} · {new Date(photo.created_at).toLocaleString()}</p>
        {photoUrls[photo.id] ? <img src={photoUrls[photo.id]} alt={stage === 'before' ? 'Before-work evidence' : 'After-work evidence'} style={{ width: '100%', maxHeight: '260px', objectFit: 'contain', borderRadius: '10px' }} /> : photoUrls[photo.id] === null ? <p className="dash-alert bad">Photo could not be loaded. Check the backend and database migration, then refresh photos.</p> : <p className="dash-muted">Loading photo…</p>}
      </article>)}</div>
      {!photos.some(p => p.phase === stage) && <p className="dash-muted">No {stage}-work photos uploaded yet.</p>}
    </div>)}
  </section>;
}
