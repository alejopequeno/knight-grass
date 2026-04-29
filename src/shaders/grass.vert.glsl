uniform float uTime;
uniform vec3 uPlayerPos;
uniform float uPatchSize;
uniform float uBendStrength;
uniform float uWindAmount;
uniform float uTrampleRadius;
uniform float uTrampleStrength;

attribute vec2 aCenter;
attribute vec2 aBend;

varying vec3 vPosition;
varying vec2 vUv;
varying vec3 vNormal;
varying float vFogDepth;
varying float vTrample;

// Must match terrainHeight in src/lib/terrain.ts
float terrainHeight(vec2 p) {
  float a = sin(p.x * 0.04) * cos(p.y * 0.04) * 1.5;
  float b = sin(p.x * 0.13 + 2.0) * cos(p.y * 0.11 + 1.0) * 0.6;
  float c = sin(p.x * 0.28 - 1.0) * cos(p.y * 0.31 - 2.0) * 0.25;
  return a + b + c;
}

void main() {
  // 1. apply per-instance transform to get the canonical blade in world space
  vec4 instanced = instanceMatrix * vec4(position, 1.0);
  vec3 wrapped = instanced.xyz;

  // 2. wrap around the player so the patch tiles infinitely
  float halfSize = uPatchSize * 0.5;
  vec2 wrappedCenter;
  wrappedCenter.x = mod(aCenter.x - uPlayerPos.x + halfSize, uPatchSize) - halfSize + uPlayerPos.x;
  wrappedCenter.y = mod(aCenter.y - uPlayerPos.z + halfSize, uPatchSize) - halfSize + uPlayerPos.z;
  vec2 wrapOffset = wrappedCenter - aCenter;
  wrapped.x += wrapOffset.x;
  wrapped.z += wrapOffset.y;

  // 2b. follow the terrain — base of every blade sits on the deformed ground
  wrapped.y += terrainHeight(wrappedCenter);

  // 3. height fraction comes from the local cone position (y in [0,1])
  float t = clamp(position.y, 0.0, 1.0);
  float curveT = t * t;

  // 4. static per-blade arc
  wrapped.x += aBend.x * curveT * uBendStrength;
  wrapped.z += aBend.y * curveT * uBendStrength;

  // 5. wind: two traveling waves at different angles + speeds
  float ts = uTime * 0.001;
  float gust1 = sin(wrappedCenter.x * 0.08 + wrappedCenter.y * 0.05 - ts * 1.2);
  float gust2 = sin(wrappedCenter.x * 0.05 - wrappedCenter.y * 0.09 - ts * 0.7);
  float windField = (gust1 + gust2) * 0.5;
  float sway = windField * curveT * uWindAmount;
  wrapped.x += sway;
  wrapped.z += sway * 0.4;

  // 6. trample: push tips away from player + sink + shimmy
  vec2 toBlade = wrappedCenter - uPlayerPos.xz;
  float dist = length(toBlade);
  float trample = 1.0 - smoothstep(0.0, uTrampleRadius, dist);
  if (trample > 0.0) {
    vec2 awayDir = toBlade / max(dist, 0.001);
    float horizontal = trample * uTrampleStrength * curveT;
    wrapped.x += awayDir.x * horizontal;
    wrapped.z += awayDir.y * horizontal;
    wrapped.y -= trample * curveT * 0.65;
    vec2 perp = vec2(-awayDir.y, awayDir.x);
    float shimmy = sin(ts * 3.2 + wrappedCenter.x * 0.6 + wrappedCenter.y * 0.4) *
                   trample * curveT * 0.12;
    wrapped.x += perp.x * shimmy;
    wrapped.z += perp.y * shimmy;
  }
  vTrample = trample;

  vPosition = wrapped;
  vUv = uv;

  // normals: rotate by the instance + model matrix (no scale handling — blades are thin enough)
  vec3 instancedNormal = mat3(instanceMatrix) * normal;
  vNormal = normalize(mat3(modelMatrix) * instancedNormal);

  vec4 mvPosition = viewMatrix * vec4(wrapped, 1.0);
  vFogDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}
