<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import tissues from '../assets/household-icons-by-state/in-stock/tissues-in-stock.svg'
import detergent from '../assets/household-icons-by-state/in-stock/laundry-detergent-in-stock.svg'
import trashBags from '../assets/household-icons-by-state/due-soon/trash-bags-due-soon.svg'
import sponge from '../assets/household-icons-by-state/in-stock/sponge-in-stock.svg'
import dishSoap from '../assets/household-icons-by-state/due-soon/dish-soap-due-soon.svg'
import lightBulb from '../assets/household-icons-by-state/in-stock/light-bulb-in-stock.svg'

import avatarOne from '../assets/household-icons-by-state/avatars/avatar-default-01.svg'
import avatarTwo from '../assets/household-icons-by-state/avatars/avatar-default-02.svg'
import avatarThree from '../assets/household-icons-by-state/avatars/avatar-default-03.svg'
import avatarFour from '../assets/household-icons-by-state/avatars/avatar-default-04.svg'

const illustrations = [tissues, avatarOne, detergent, sponge, avatarTwo, trashBags, lightBulb, avatarThree, dishSoap, avatarFour]
const wallpaper = ref(null)
const decorations = ref({ left: [], right: [] })
const avatars = new Set([avatarOne, avatarTwo, avatarThree, avatarFour])
const illustrationGroup = src => avatars.has(src) ? 'avatar'
  : [detergent, dishSoap].includes(src) ? 'bottle' : src
let observer

function scatter(width, height, seed, side) {
  if (width < 96 || height < 96) return []
  // Stable seeded randomness: resizing reflows decorations; navigation does not shuffle them.
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const points = []
  const count = Math.min(360, Math.max(1, Math.floor(width * height / 8500)))
  for (let attempt = 0; points.length < count && attempt < count * 180; attempt++) {
    const edgeCount = Math.ceil(height / 190)
    const atOuterEdge = attempt < edgeCount
    // Let artwork bleed off the viewport, while protecting the central shell.
    const x = atOuterEdge
      ? (side === 'left' ? -random() * 12 : width + random() * 12)
      : (side === 'left' ? -16 : 46) + random() * (width - 30)
    const y = atOuterEdge
      ? (attempt + .5) * height / edgeCount + (random() - .5) * 48
      : 8 + random() * (height - 16)
    if (points.some(point => Math.hypot(point.x - x, point.y - y) < 80)) continue
    const neighbours = points.filter(point => Math.hypot(point.x - x, point.y - y) < 145)
    const candidates = illustrations.filter(src => !neighbours.some(point => illustrationGroup(point.src) === illustrationGroup(src)))
    if (!candidates.length) continue
    const src = candidates[Math.floor(random() * candidates.length)]
    points.push({
      x, y, src, isAvatar: avatars.has(src),
      style: {
        left: `${x}px`, top: `${y}px`,
        '--decoration-angle': `${random() * 100 - 50}deg`,
        '--decoration-size': `${44 + random() * 24}px`,
      },
    })
  }
  // Keep the scattered positions, with a few deliberate visual accents.
  const replaceArtwork = (point, src) => {
    if (!point) return
    point.src = src
    point.isAvatar = avatars.has(src)
  }
  if (side === 'left') {
    replaceArtwork(points.filter(point => point.src === sponge).sort((a, b) => a.y - b.y)[0], trashBags)
  } else {
    const smilingAvatars = points.filter(point => point.src === avatarTwo).sort((a, b) => a.y - b.y)
    replaceArtwork(smilingAvatars[0], avatarThree)
    replaceArtwork(smilingAvatars[1], lightBulb)
  }
  return points
}
onMounted(() => {
  observer = new ResizeObserver(entries => {
    for (const entry of entries) {
      const side = entry.target.dataset.side
      decorations.value[side] = scatter(entry.contentRect.width, entry.contentRect.height, side === 'left' ? 1729 : 7919, side)
    }
  })
  wallpaper.value?.querySelectorAll('.wallpaper-edge').forEach(edge => observer.observe(edge))
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <Teleport to="body">
    <div ref="wallpaper" class="desktop-wallpaper" aria-hidden="true">
      <div v-for="side in ['left', 'right']" :key="side" :data-side="side" class="wallpaper-edge" :class="`wallpaper-edge--${side}`">
        <div class="wallpaper-pattern">
        <img v-for="(decoration, index) in decorations[side]" :key="index" :src="decoration.src" :class="{ 'wallpaper-avatar': decoration.isAvatar }" :style="decoration.style" alt="" draggable="false" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.desktop-wallpaper { display: none; }
@media (min-width: 1024px) {
  .desktop-wallpaper { display: block; position: fixed; inset: 0; overflow: clip; pointer-events: none; user-select: none; z-index: 0; }
  /* The central 940px shell plus a 20px safety gap on each side stays clear. */
  .wallpaper-edge {
    position: absolute; top: 0; bottom: 0;
    width: max(0px, calc((100% - 980px) / 2)); overflow: clip;
    container: wallpaper / size;
    mask-image: linear-gradient(to bottom, transparent, #000 24px, #000 calc(100% - 24px), transparent);
  }
  .wallpaper-edge--left { left: 0; }
  .wallpaper-edge--right { right: 0; }
  .wallpaper-pattern { position: absolute; inset: 0; }
  .wallpaper-pattern img {
    position: absolute;
    width: var(--decoration-size); height: var(--decoration-size);
    object-fit: contain;
    transform: translate(-50%, -50%) rotate(var(--decoration-angle));
    filter: brightness(0) saturate(100%) invert(42%) sepia(23%) saturate(1084%) hue-rotate(68deg) brightness(94%) contrast(90%);
    opacity: .14;
  }
  .wallpaper-pattern img.wallpaper-avatar { width: 44px; height: 44px; filter: none; opacity: .18; }
  @container wallpaper (max-width: 95px) { .wallpaper-pattern { display: none; } }
}
</style>
