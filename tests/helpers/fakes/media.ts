const state: {
  nextImageUrl: string
  nextVideoUrl: string
  nextAudioUrl: string
} = {
  nextImageUrl: 'images/fake-image.jpg',
  nextVideoUrl: 'video/fake-video.mp4',
  nextAudioUrl: 'voice/fake-audio.mp3',
}

export function configureFakeMedia(params: {
  imageUrl?: string
  videoUrl?: string
  audioUrl?: string
}) {
  if (params.imageUrl) state.nextImageUrl = params.imageUrl
  if (params.videoUrl) state.nextVideoUrl = params.videoUrl
  if (params.audioUrl) state.nextAudioUrl = params.audioUrl
}

export function resetFakeMedia() {
  state.nextImageUrl = 'images/fake-image.jpg'
  state.nextVideoUrl = 'video/fake-video.mp4'
  state.nextAudioUrl = 'voice/fake-audio.mp3'
}

export async function fakeGenerateImage() {
  return { success: true, imageUrl: state.nextImageUrl }
}

export async function fakeGenerateVideo() {
  return { success: true, videoUrl: state.nextVideoUrl }
}

export async function fakeGenerateAudio() {
  return { success: true, audioUrl: state.nextAudioUrl }
}
