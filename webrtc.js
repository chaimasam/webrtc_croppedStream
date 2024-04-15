let localStream;
let localVideo ;
let peerConnection;
let serverConnection;
let uuid;

const peerConnectionConfig = {
  'iceServers': [
    {'urls': 'stun:stun.stunprotocol.org:3478'},
    {'urls': 'stun:stun.l.google.com:19302'},
  ]
};


async function pageReady() {
  uuid = createUUID();
  video = document.getElementById('video'); 
  canvas = document.getElementById('canvas');
  var localVideo = document.getElementById('localVideo');
  
  ctx = canvas.getContext('2d');

  serverConnection = new WebSocket(`wss://webrtcserver.tunnel.ucaya.com`);
  serverConnection.onmessage = gotMessageFromServer;

  const constraints = {
    video: true,
    video: {
      width: { min: 3840 },
      height: { min: 2160 }
    }
  };


  if (!navigator.mediaDevices.getUserMedia) {
    alert('Your browser does not support getUserMedia API');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;

    // Update canvas with cropped video frame and capture stream
    function updateCanvasAndCaptureStream() {
      //ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Dimensions de la vidéo 4K (3840x2160 pixels)
      const videoWidth = 3840;
      const videoHeight = 2160;

      // Dimensions de la région de recadrage (1920x1800 pixels)
      const cropWidth = 1920;
      const cropHeight = 1800;

      // Coordonnées du coin supérieur gauche de la région de recadrage
      const cropX = (videoWidth - cropWidth) / 2;
      const cropY = (videoHeight - cropHeight) / 2;


      // Dessiner la région recadrée sur le canvas
      ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
      requestAnimationFrame(updateCanvasAndCaptureStream);
    }

    // Start updating canvas and capturing stream when video is playing
    video.addEventListener('play', function() {               
      requestAnimationFrame(updateCanvasAndCaptureStream);
      capturedStream =canvas.captureStream()
      localVideo.srcObject = capturedStream;
      localStream = capturedStream;
    });
    // Update canvas when video time changes
    video.addEventListener('timeupdate', function() {
      requestAnimationFrame(updateCanvasAndCaptureStream);

    });

  } catch(error) {
    errorHandler(error);
  }
}



function start(isCaller) {
  peerConnection = new RTCPeerConnection(peerConnectionConfig);
  peerConnection.onicecandidate = gotIceCandidate;

  for(const track of localStream.getTracks()) {
    peerConnection.addTrack(track, localStream);
  }

  if(isCaller) {
    peerConnection.createOffer().then(createdDescription).catch(errorHandler);
  }
}

function gotMessageFromServer(message) {
  if(!peerConnection) start(false);

  const signal = JSON.parse(message.data);

  // Ignore messages from ourself
  if(signal.uuid == uuid) return;

  if(signal.sdp) {
    peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
      // Only create answers in response to offers
      if(signal.sdp.type !== 'offer') return;

      peerConnection.createAnswer().then(createdDescription).catch(errorHandler);
    }).catch(errorHandler);
  } else if(signal.ice) {
    peerConnection.addIceCandidate(new RTCIceCandidate(signal.ice)).catch(errorHandler);
  }
}

function gotIceCandidate(event) {
  if(event.candidate != null) {
    serverConnection.send(JSON.stringify({'ice': event.candidate, 'uuid': uuid}));
  }
}

function createdDescription(description) {
  console.log('got description');

  peerConnection.setLocalDescription(description).then(() => {
    serverConnection.send(JSON.stringify({'sdp': peerConnection.localDescription, 'uuid': uuid}));
  }).catch(errorHandler);
}



function errorHandler(error) {
  console.log(error);
}

// Taken from http://stackoverflow.com/a/105074/515584
// Strictly speaking, it's not a real UUID, but it gets the job done here
function createUUID() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  }

  return `${s4() + s4()}-${s4()}-${s4()}-${s4()}-${s4() + s4() + s4()}`;
}