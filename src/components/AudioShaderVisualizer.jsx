import React, { useEffect, useRef, useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Pause, Upload, ArrowLeftRight } from 'lucide-react';

const vertexShaderSource = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragmentShaderSource = `
  precision mediump float;
  uniform vec2 iResolution;
  uniform float iTime;
  uniform float uAmplitude;
  uniform float uSpeed;
  uniform float uColorShift;
  uniform float uIterations;
  uniform float uAudioLevel;
  uniform float uUVScale;
  uniform float uDirection;

  vec3 palette(float t) {
    vec3 a = vec3(0.5, 0.5, 0.5);
    vec3 b = vec3(0.5, 0.5, 0.5);
    vec3 c = vec3(1.0, 1.0, 1.0);
    vec3 d = vec3(0.263,0.416,0.557);
    return a + b*cos(6.28318*(c*t+d + uAudioLevel));
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - iResolution.xy) / iResolution.y;
    vec2 uv0 = uv;
    vec3 finalColor = vec3(0.0);
    
    float adjustedTime = iTime * (uSpeed * uSpeed * 0.1) * uDirection;
    
    for (float i = 0.0; i < 12.0; i++) {
      float iterationWeight = 1.0;
      if (i > uIterations - 1.0) {
        iterationWeight = 1.0 - (i - (uIterations - 1.0));
        iterationWeight = clamp(iterationWeight, 0.0, 1.0);
        if (iterationWeight <= 0.0) break;
      }
      
      uv = fract(uv * uUVScale) - 0.5;
      float d = length(uv) * exp(-length(uv0));
      vec3 col = palette(length(uv0) + i*uColorShift + adjustedTime);
      d = sin(d*8. * uAmplitude + adjustedTime)/8.;
      d = abs(d);
      d = pow(0.01 / d, 1.2);
      finalColor += col * d * iterationWeight;
    }
    
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

const AudioShaderVisualizer = () => {
  const canvasRef = useRef(null);
  const glRef = useRef(null);
  const programRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const animationFrameRef = useRef(null);
  const startTimeRef = useRef(Date.now());
  const fileInputRef = useRef(null);
  const uniformLocationsRef = useRef({});
  const audioDataRef = useRef(new Uint8Array(0));
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioFile, setAudioFile] = useState(null);
  const [direction, setDirection] = useState(1); // 1 for forward, -1 for reverse
  
  const [amplitude, setAmplitude] = useState(0.5);
  const [speed, setSpeed] = useState(2.0);
  const [colorShift, setColorShift] = useState(0.4);
  const [iterations, setIterations] = useState(1.0);
  const [uvScale, setUVScale] = useState(1.5);

  const handleTouchStart = (e) => {
    const target = e.target;
    if (target.matches('[role="slider"]')) {
      e.stopPropagation();
    }
  };

  const handleTouchMove = (e) => {
    const target = e.target;
    if (target.matches('[role="slider"]')) {
      e.stopPropagation();
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas.getContext('webgl');
    glRef.current = gl;

    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexShaderSource);
    gl.compileShader(vertexShader);

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentShaderSource);
    gl.compileShader(fragmentShader);

    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      console.error('Fragment shader compilation error:', gl.getShaderInfoLog(fragmentShader));
      return;
    }

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    programRef.current = program;

    const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    uniformLocationsRef.current = {
      iTime: gl.getUniformLocation(program, 'iTime'),
      iResolution: gl.getUniformLocation(program, 'iResolution'),
      uAmplitude: gl.getUniformLocation(program, 'uAmplitude'),
      uSpeed: gl.getUniformLocation(program, 'uSpeed'),
      uColorShift: gl.getUniformLocation(program, 'uColorShift'),
      uIterations: gl.getUniformLocation(program, 'uIterations'),
      uAudioLevel: gl.getUniformLocation(program, 'uAudioLevel'),
      uUVScale: gl.getUniformLocation(program, 'uUVScale'),
      uDirection: gl.getUniformLocation(program, 'uDirection')
    };

    animate();

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (glRef.current && programRef.current) {
      const gl = glRef.current;
      gl.useProgram(programRef.current);
      
      gl.uniform1f(uniformLocationsRef.current.uAmplitude, amplitude);
      gl.uniform1f(uniformLocationsRef.current.uSpeed, Math.abs(speed)); // Always use positive speed
      gl.uniform1f(uniformLocationsRef.current.uColorShift, colorShift);
      gl.uniform1f(uniformLocationsRef.current.uIterations, iterations);
      gl.uniform1f(uniformLocationsRef.current.uUVScale, uvScale);
      gl.uniform1f(uniformLocationsRef.current.uDirection, direction);
    }
  }, [amplitude, speed, colorShift, iterations, uvScale, direction]);

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (file) {
      setAudioFile(file);
      if (sourceRef.current) {
        sourceRef.current.stop();
        sourceRef.current = null;
      }
      setIsPlaying(false);
    }
  };

  const handlePlayPause = async () => {
    if (!audioFile) {
      alert('Please select an audio file first');
      return;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      audioDataRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
      
      try {
        const fileReader = new FileReader();
        
        fileReader.onload = async (e) => {
          const arrayBuffer = e.target.result;
          const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
          
          sourceRef.current = audioContextRef.current.createBufferSource();
          sourceRef.current.buffer = audioBuffer;
          sourceRef.current.connect(analyserRef.current);
          analyserRef.current.connect(audioContextRef.current.destination);
          sourceRef.current.start();
          setIsPlaying(true);
          startTimeRef.current = Date.now();
        };
        
        fileReader.readAsArrayBuffer(audioFile);
      } catch (error) {
        console.error('Error loading audio:', error);
      }
    } else {
      if (isPlaying) {
        audioContextRef.current.suspend();
      } else {
        audioContextRef.current.resume();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleDirection = () => {
    setDirection(prev => prev * -1);
  };

  const getAverageAudioLevel = () => {
    if (!analyserRef.current || !isPlaying) return 0;
    
    analyserRef.current.getByteFrequencyData(audioDataRef.current);
    const sum = audioDataRef.current.reduce((acc, val) => acc + val, 0);
    return sum / (audioDataRef.current.length * 255);
  };

  const animate = () => {
    const gl = glRef.current;
    const canvas = canvasRef.current;
    
    if (!gl || !canvas) return;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(programRef.current);

    const time = (Date.now() - startTimeRef.current) / 1000;
    const audioLevel = getAverageAudioLevel();

    gl.uniform1f(uniformLocationsRef.current.iTime, time);
    gl.uniform2f(uniformLocationsRef.current.iResolution, canvas.width, canvas.height);
    gl.uniform1f(uniformLocationsRef.current.uAudioLevel, audioLevel);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    animationFrameRef.current = requestAnimationFrame(animate);
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-2 sm:p-4 bg-zinc-900 min-h-screen">
      <Card className="bg-zinc-800 border-zinc-700">
        <CardHeader>
          <CardTitle className="font-mono text-gray-100 text-xl sm:text-2xl">Dynamic Shader Visualizer</CardTitle>
          <CardTitle className="font-mono text-gray-100 text-xs sm:text-xs">by try.pabl0</CardTitle>
          <CardTitle className="font-mono text-gray-100 text-xs sm:text-xs">original shader by kishimisu</CardTitle>
        </CardHeader>
        <CardContent>
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            className="w-full aspect-[4/3] bg-black rounded-lg mb-4"
          />
          
          <div className="flex flex-wrap gap-2 mb-4">
            <Button
              onClick={toggleDirection}
              variant="outline"
              className="font-mono flex-1 min-w-[120px] bg-zinc-700 hover:bg-zinc-600 text-zinc-100"
            >
              <ArrowLeftRight className="w-4 h-4 mr-2" />
              {direction > 0 ? 'Forward' : 'Reverse'}
            </Button>
          </div>
          
          <div className="grid gap-4 sm:gap-6">
            <div className="space-y-4">
              <div 
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
              >
                <label className="font-mono block mb-2 text-sm sm:text-base text-zinc-300">
                  UV Scale ({uvScale.toFixed(1)})
                </label>
                <Slider
                  value={[uvScale]}
                  onValueChange={(value) => setUVScale(value[0])}
                  min={0.1}
                  max={3.5}
                  step={0.01}
                  className="cursor-pointer"
                />
              </div>
              
              <div 
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
              >
                <label className="font-mono block mb-2 text-sm sm:text-base text-zinc-300">
                  Amplitude ({amplitude.toFixed(2)})
                </label>
                <Slider
                  value={[amplitude]}
                  onValueChange={(value) => setAmplitude(value[0])}
                  min={0}
                  max={2}
                  step={0.01}
                  className="cursor-pointer"
                />
              </div>
  
              <div 
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
              >
                <label className="font-mono block mb-2 text-sm sm:text-base text-zinc-300">
                  Speed ({speed.toFixed(2)})
                </label>
                <Slider
                  value={[speed]}
                  onValueChange={(value) => setSpeed(value[0])}
                  min={0}
                  max={10}
                  step={0.01}
                  className="cursor-pointer"
                />
              </div>
  
              <div 
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
              >
                <label className="font-mono block mb-2 text-sm sm:text-base text-zinc-300">
                  Color Shift ({colorShift.toFixed(1)})
                </label>
                <Slider
                  value={[colorShift]}
                  onValueChange={(value) => setColorShift(value[0])}
                  min={0}
                  max={1}
                  step={0.1}
                  className="cursor-pointer"
                />
              </div>
  
              <div 
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
              >
                <label className="font-mono block mb-2 text-sm sm:text-base text-zinc-300">
                  Iterations ({iterations.toFixed(1)})
                </label>
                <Slider
                  value={[iterations]}
                  onValueChange={(value) => setIterations(value[0])}
                  min={0.2}
                  max={3}
                  step={0.1}
                  className="cursor-pointer"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AudioShaderVisualizer;