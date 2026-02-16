import React, { useRef, useState, useEffect } from 'react'

export default function App() {
  const localVideoRef = useRef(null)
  const remoteVideosRef = useRef({}) // { feedId: videoElement }
  const janusRef = useRef(null)
  const publisherRef = useRef(null)
  const subscribersRef = useRef({}) // { feedId: handle }
  const [room, setRoom] = useState('1234')
  const [janusUrl, setJanusUrl] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('janus')) return params.get('janus')
      return `ws://${window.location.hostname}:8188`
    } catch (e) { return 'ws://localhost:8188' }
  })
  const [connected, setConnected] = useState(false)
  const [janusLoaded, setJanusLoaded] = useState(false)

  useEffect(() => {
    const loadScript = (src) => {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) return resolve()
        const script = document.createElement('script')
        script.src = src
        script.async = true
        script.onload = resolve
        script.onerror = reject
        document.body.appendChild(script)
      })
    }

    const loadJanus = async () => {
      if (window.Janus) { setJanusLoaded(true); return }
      try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/webrtc-adapter/8.2.3/adapter.min.js')
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js')
        await loadScript('https://cdn.jsdelivr.net/gh/meetecho/janus-gateway@v1.2.0/html/janus.js')
        setJanusLoaded(true)
      } catch (e) { console.error('Janus load error', e) }
    }
    loadJanus()
  }, [])

  async function joinRoom() {
    try {
      // Check if Janus is loaded
      if (!window.Janus) {
        alert('Janus library not loaded yet. Please wait and try again.')
        return
      }

      // Check for camera access support (often blocked on HTTP)
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Camera access is blocked. If you are on mobile, you must use HTTPS (not HTTP) or localhost. Try using ngrok to create a secure tunnel.')
        return
      }

      // Initialize Janus
      window.Janus.init({
        debug: true,
        callback: async () => {
          if (!window.Janus.isWebrtcSupported()) {
            alert('WebRTC not supported')
            return
          }

          // Create session
          const janus = new window.Janus({
            server: janusUrl,
            success: async () => {
              janusRef.current = janus

              // Get local media
              try {
                const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
                localVideoRef.current.srcObject = localStream
              } catch (e) {
                alert('Error accessing camera: ' + e.message)
                return
              }

              // Create publisher handle
              janus.attach({
                plugin: 'janus.plugin.videoroom',
                success: async (pluginHandle) => {
                  publisherRef.current = pluginHandle
                  const body = { request: 'join', room: parseInt(room), ptype: 'publisher', display: 'User-' + Math.random().toString(36).substr(2, 9) }

                  pluginHandle.send({
                    message: body
                  })
                },
                error: (error) => {
                  console.error('Plugin error:', error)
                  alert('Error attaching plugin: ' + error)
                },
                onmessage: (msg, jsep) => {
                  const event = msg.videoroom
                  if (event === 'joined') {
                    // Publish local stream
                    const offerParams = { media: { video: true, audio: true } }
                    publisherRef.current.createOffer({
                      ...offerParams,
                      success: (jsep) => {
                        const body = { request: 'configure', audio: true, video: true }
                        publisherRef.current.send({ message: body, jsep })
                      },
                      error: (error) => console.error('WebRTC error:', error)
                    })

                    // Handle existing publishers (remote subscribers)
                    if (msg.publishers && msg.publishers.length > 0) {
                      msg.publishers.forEach(pub => subscribeToPublisher(pub))
                    }
                  } else if (event === 'event') {
                    if (msg.publishers) {
                      // New publisher joined
                      msg.publishers.forEach(pub => {
                        if (!subscribersRef.current[pub.id]) {
                          subscribeToPublisher(pub)
                        }
                      })
                    } else if (msg.leaving) {
                      // Publisher left
                      detachSubscriber(msg.leaving)
                    }
                  }

                  if (jsep) {
                    publisherRef.current.handleRemoteJsep({ jsep })
                  }
                },
                onremotestream: (stream) => {
                  // Publisher's own stream (for UI confirmation if needed)
                  console.log('Publisher stream established')
                }
              })

              setConnected(true)
            },
            error: (error) => {
              console.error('Janus error:', error)
              alert('Error initializing Janus: ' + error)
            }
          })
        }
      })
    } catch (error) {
      console.error('Error joining room:', error)
      alert('Error: ' + error.message)
    }
  }

  function subscribeToPublisher(pub) {
    const janus = janusRef.current
    if (!janus) return

    janus.attach({
      plugin: 'janus.plugin.videoroom',
      success: async (pluginHandle) => {
        subscribersRef.current[pub.id] = pluginHandle
        const display = pub.display || 'Anonymous'

        // Create remote video element
        const videoContainer = document.getElementById('remote-videos')
        if (videoContainer) {
          const videoDiv = document.createElement('div')
          videoDiv.id = `remote-${pub.id}`
          videoDiv.style.textAlign = 'center'
          const video = document.createElement('video')
          video.autoplay = true
          video.playsInline = true
          video.controls = true
          video.style.width = '320px'
          video.style.height = '240px'
          video.style.background = '#222'
          video.style.borderRadius = '8px'
          const title = document.createElement('h4')
          title.textContent = display
          title.style.margin = '5px 0'
          videoDiv.appendChild(title)
          videoDiv.appendChild(video)
          videoContainer.appendChild(videoDiv)
          remoteVideosRef.current[pub.id] = video
        }

        const body = { request: 'join', room: parseInt(room), ptype: 'subscriber', feed: pub.id, display: 'Subscriber' }
        pluginHandle.send({
          message: body,
          success: (result) => {
            // Send answer when offer is received
          }
        })
      },
      error: (error) => console.error('Subscriber plugin error:', error),
      onmessage: (msg, jsep) => {
        if (jsep) {
          const pluginHandle = subscribersRef.current[pub.id]
          pluginHandle.createAnswer({
            jsep,
            media: { audioSend: false, videoSend: false },
            success: (answer) => {
              const body = { request: 'start', room: parseInt(room) }
              pluginHandle.send({ message: body, jsep: answer })
            },
            error: (error) => console.error('WebRTC answer error:', error)
          })
        }
      },
      onremotestream: (stream) => {
        const video = remoteVideosRef.current[pub.id]
        if (video) {
          window.Janus.attachMediaStream(video, stream)
          video.play().catch(e => console.error('Error playing remote video:', e))
        }
      }
    })
  }

  function detachSubscriber(feedId) {
    const pluginHandle = subscribersRef.current[feedId]
    if (pluginHandle) {
      pluginHandle.detach()
      delete subscribersRef.current[feedId]
    }
    const videoDiv = document.getElementById(`remote-${feedId}`)
    if (videoDiv) {
      videoDiv.remove()
    }
    delete remoteVideosRef.current[feedId]
  }

  function leaveRoom() {
    // Detach all subscribers
    Object.keys(subscribersRef.current).forEach(feedId => {
      detachSubscriber(feedId)
    })

    // Leave and detach publisher
    if (publisherRef.current) {
      const body = { request: 'leave' }
      publisherRef.current.send({ message: body })
      publisherRef.current.detach()
      publisherRef.current = null
    }

    // Destroy Janus session
    if (janusRef.current) {
      janusRef.current.destroy()
      janusRef.current = null
    }

    // Stop local stream
    if (localVideoRef.current && localVideoRef.current.srcObject) {
      localVideoRef.current.srcObject.getTracks().forEach(track => track.stop())
    }

    setConnected(false)
  }

  return (
    <div style={{ padding: 20, fontFamily: 'Arial, sans-serif' }}>
      <h1>Viscord Advanced - Janus SFU</h1>
      <div style={{ marginBottom: 20 }}>
        <label>Room ID: </label>
        <input 
          value={room} 
          onChange={e => setRoom(e.target.value)} 
          disabled={connected}
          style={{ marginRight: 10, padding: 5 }}
        />
        <label style={{ marginLeft: 6 }}>Janus URL (optional): </label>
        <input
          value={janusUrl}
          onChange={e => setJanusUrl(e.target.value)}
          placeholder="ws://localhost:8188 or wss://example.com:8189"
          style={{ width: 360, marginLeft: 6, padding: 5 }}
        />
        <button 
          onClick={joinRoom} 
          disabled={connected || !janusLoaded}
          style={{ padding: '5px 20px', marginRight: 10, cursor: connected || !janusLoaded ? 'not-allowed' : 'pointer' }}
        >
          {!janusLoaded ? 'Loading Janus...' : 'Join Room'}
        </button>
        {connected && (
          <button 
            onClick={leaveRoom}
            style={{ padding: '5px 20px', cursor: 'pointer' }}
          >
            Leave Room
          </button>
        )}
      </div>
      <div style={{ marginTop: 20, padding: 10, background: '#f0f0f0', borderRadius: 8 }}>
        <h3>Your Video</h3>
        <video 
          ref={localVideoRef} 
          autoPlay 
          playsInline 
          muted 
          style={{ width: 320, height: 240, background: '#000', borderRadius: 8 }} 
        />
      </div>
      <div style={{ marginTop: 20 }}>
        <h3>Remote Participants</h3>
        <div id="remote-videos" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }} />
      </div>
      <p style={{ marginTop: 20, color: '#666', fontSize: 14 }}>
        {connected ? '✓ Connected to Janus room: ' + room : 'Not connected. Enter a room ID and click Join.'}
      </p>
    </div>
  )
}
