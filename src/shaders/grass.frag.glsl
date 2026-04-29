uniform sampler2D uCloud;
uniform sampler2D uGrassMap;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uGroundFogTop;
uniform float uGroundFogBottom;
uniform float uGroundFogDensity;
uniform vec3 uLightDir;
uniform vec3 uSpecColor;
uniform float uSpecStrength;
uniform float uSpecShininess;
uniform float uRimStrength;
uniform vec3 uBaseColor;
uniform vec3 uTipColor;
uniform vec3 uSkyAmbient;
uniform vec3 uGroundAmbient;
uniform float uAmbientStrength;
uniform float uTintStrength;

varying vec3 vPosition;
varying vec2 vUv;
varying vec3 vNormal;
varying float vFogDepth;
varying float vTrample;

void main() {
  // sample painted grass card; alpha test cuts the card down to strands.
  // texture is intentionally desaturated — it carries SHAPE + LUMINANCE only.
  vec4 tex = texture2D(uGrassMap, vUv);
  if (tex.a < 0.4) discard;

  // colour comes from leva palette; texture luminance modulates it so
  // strands have a visible base→tip shading. Texture luminance is in [~0.2, 0.75]
  // — we remap it to [0.6, 2.2] before multiplying so the palette stays readable.
  float h = clamp(vPosition.y / 1.5, 0.0, 1.0);
  vec3 palette = mix(uBaseColor, uTipColor, h);
  float texLum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
  float lift = mix(0.6, 2.2, texLum);
  vec3 paletteShaded = palette * lift;
  vec3 color = mix(tex.rgb, paletteShaded, uTintStrength);

  // soft cloudy noise variation (low-frequency colour breakup)
  vec3 cloud = texture2D(uCloud, vUv * 0.3).rgb;
  color = mix(color, color * (0.75 + cloud.r * 0.5), 0.25);

  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;

  vec3 V = normalize(cameraPosition - vPosition);
  vec3 L = normalize(uLightDir);
  vec3 T = vec3(0.0, 1.0, 0.0);

  // fake AO: blade roots are buried in surrounding blades — darken them.
  float ao = mix(0.25, 1.0, smoothstep(0.0, 0.65, h));

  // hemisphere fake-IBL: subtle tint, no brightness gain — preserves saturation.
  float upDot = N.y * 0.5 + 0.5;
  vec3 hemiTint = mix(uGroundAmbient, uSkyAmbient, upDot);
  float hemiLum = max(dot(hemiTint, vec3(0.299, 0.587, 0.114)), 0.001);
  hemiTint /= hemiLum;
  color *= mix(vec3(1.0), hemiTint, uAmbientStrength * 0.4 * ao);

  // direct moonlight diffuse (soft) — gated by AO so roots stay dark
  float diffuse = max(0.0, dot(N, L));
  color *= (0.6 + 0.4 * ao) * (0.85 + 0.15 * diffuse);

  // anisotropic specular (Kajiya-Kay, half-vector form)
  vec3 H = normalize(L + V);
  float HdotT = dot(H, T);
  float sinHT = sqrt(max(0.0001, 1.0 - HdotT * HdotT));
  float aniso = pow(sinHT, uSpecShininess);

  // fresnel rim — edge-on blades catch the moonlight against the sky.
  float fresnel = pow(1.0 - abs(dot(N, V)), 3.0);

  // Two gates: distance gate (close blades keep spec), horizon gate (far
  // horizontal blades lose spec to avoid the bright band at the horizon).
  float distGate = 1.0 - smoothstep(12.0, 45.0, vFogDepth);
  float horizonGate = smoothstep(0.0, 0.35, V.y);
  float specGate = max(distGate, horizonGate);

  float heightMask = smoothstep(0.2, 1.3, vPosition.y);
  vec3 highlight = uSpecColor *
    (aniso * uSpecStrength * specGate + fresnel * uRimStrength * specGate) *
    heightMask;
  color += highlight;

  // Sun glint / back-light: when the camera looks toward the sun and the
  // blade is between camera and sun, light "passes through" the blade and
  // the tips glow with sun colour. This is the cinematic backlit-grass look.
  float sunFacing = max(0.0, dot(-V, L));
  float glint = pow(sunFacing, 6.0);
  // tips translucency mask — mostly affects the upper half of the blade
  float tipMask = smoothstep(0.4, 1.2, vPosition.y);
  vec3 sunColor = uSpecColor * 1.4;
  color += sunColor * glint * tipMask * 0.9;

  // distance fog (atmospheric perspective)
  float distFog = smoothstep(uFogNear, uFogFar, vFogDepth);

  // ground fog: blade roots disappear into a low-lying mist band.
  // dense at the floor, fades out by knee/waist height.
  float groundFog = (1.0 - smoothstep(uGroundFogBottom, uGroundFogTop, vPosition.y)) * uGroundFogDensity;

  // combine fogs (Beer's law style — independent attenuations)
  float combined = 1.0 - (1.0 - distFog) * (1.0 - groundFog);
  vec3 atmos = mix(uFogColor, uBaseColor * 0.7, 0.5);
  color = mix(color, atmos, combined);

  gl_FragColor = vec4(color, 1.0);
}
