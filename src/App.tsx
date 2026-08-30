import { useState, useEffect } from 'react';
import { 
  DndContext, 
  useDraggable, 
  useDroppable, 
  type DragEndEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import './App.css';

// --- GAME TYPES ---
type PieceType = 'mirror-angled' | 'splitter' | 'prism' | 'source' | 'target' | 'obstacle';
interface GamePiece { id: string; type: PieceType; rotation: number; emoji: string; isStatic?: boolean; }
interface GridCellData { id: string; row: number; col: number; piece: GamePiece | null; }
interface Coordinate { row: number; col: number; }
type GameState = 'playing' | 'won' | 'victory';
type AppState = 'booting' | 'active';

// --- LEVEL DESIGN CONFIGURATION ---
const LEVEL_CONFIGS = [
  // WARM UPS
  { id: 1, source: { r: 0, c: 0 }, target: { r: 5, c: 5 }, obstacles: [], inventory: [90, 0] },
  { id: 2, source: { r: 0, c: 1 }, target: { r: 5, c: 4 }, obstacles: [{ r: 2, c: 1 }, { r: 2, c: 2 }, { r: 2, c: 3 }, { r: 2, c: 4 }], inventory: [90, 0, 90] },
  { id: 3, source: { r: 1, c: 0 }, target: { r: 4, c: 5 }, obstacles: [{ r: 1, c: 2 }, { r: 2, c: 2 }, { r: 3, c: 4 }, { r: 4, c: 4 }], inventory: [90, 0, 270] },
  { id: 4, source: { r: 1, c: 0 }, target: { r: 1, c: 4 }, obstacles: [{ r: 1, c: 2 }, { r: 1, c: 3 }], inventory: [90, 90, 0, 0] },
  { id: 5, source: { r: 2, c: 0 }, target: { r: 4, c: 2 }, obstacles: [{ r: 2, c: 2 }, { r: 4, c: 1 }, { r: 4, c: 3 }], inventory: [90, 90, 0, 0] },
  { id: 6, source: { r: 0, c: 0 }, target: { r: 5, c: 0 }, obstacles: [{ r: 1, c: 0 }, { r: 2, c: 0 }, { r: 3, c: 0 }, { r: 4, c: 0 }], inventory: [90, 0] },
  { id: 7, source: { r: 1, c: 0 }, target: { r: 1, c: 5 }, obstacles: [{ r: 0, c: 3 }, { r: 1, c: 3 }, { r: 2, c: 3 }, { r: 3, c: 3 }], inventory: [90, 0, 90, 0] },
  
  // MAZES
  { id: 8, source: { r: 1, c: 0 }, target: { r: 4, c: 0 }, obstacles: [{ r: 2, c: 0 }, { r: 2, c: 1 }, { r: 2, c: 2 }, { r: 4, c: 3 }, { r: 4, c: 4 }, { r: 4, c: 5 }], inventory: [90, 0, 90, 0, 90, 0] },
  { id: 9, source: { r: 2, c: 0 }, target: { r: 2, c: 5 }, obstacles: [{ r: 1, c: 2 }, { r: 2, c: 2 }, { r: 3, c: 2 }, { r: 1, c: 4 }, { r: 2, c: 4 }, { r: 3, c: 4 }], inventory: [90, 0, 90, 0, 90, 0] },
  
  // THE FORTRESS
  { id: 10, source: { r: 1, c: 0 }, target: { r: 1, c: 5 }, obstacles: [{ r: 1, c: 2 }, { r: 2, c: 2 }, { r: 3, c: 2 }, { r: 4, c: 2 }, { r: 4, c: 3 }, { r: 1, c: 4 }, { r: 2, c: 4 }, { r: 3, c: 4 }], inventory: [90, 0, 90, 0] }
];

// --- COMPONENTS ---
function InventoryPiece({ piece }: { piece: GamePiece }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: piece.id, data: piece });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="inventory-piece">{piece.emoji}</div>;
}

function GridPiece({ piece, onRotate }: { piece: GamePiece; onRotate: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: piece.id, data: piece, disabled: piece.isStatic });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="draggable-wrapper">
      <div 
        className={`placed-piece ${piece.type === 'source' ? 'piece-source' : ''} ${piece.type === 'target' ? 'piece-target' : ''} ${piece.type === 'obstacle' ? 'piece-obstacle' : ''}`} 
        onClick={() => onRotate(piece.id)}
        style={{ transform: `rotate(${piece.rotation}deg)` }}
      >
        {piece.emoji}
      </div>
    </div>
  );
}

function GridCell({ cell, onRotate }: { cell: GridCellData; onRotate: (id: string) => void }) {
  const { isOver, setNodeRef } = useDroppable({ id: cell.id, data: cell });
  return <div ref={setNodeRef} className={`grid-cell ${isOver ? 'highlight' : ''}`}>{cell.piece ? <GridPiece piece={cell.piece} onRotate={onRotate} /> : ''}</div>;
}

function InventoryPanel({ inventory }: { inventory: GamePiece[] }) {
  const { isOver, setNodeRef } = useDroppable({ id: 'inventory-zone' });
  return (
    <div ref={setNodeRef} className={`inventory-panel ${isOver ? 'highlight-inv' : ''}`}>
      <h3>Inventory</h3>
      <div className="inventory-slots">{inventory.map(piece => <InventoryPiece key={piece.id} piece={piece} />)}</div>
    </div>
  );
}

// --- MAIN APP ---
export default function App() {
  const [appState, setAppState] = useState<AppState>('booting');
  const [levelIndex, setLevelIndex] = useState(0);
  const [gameState, setGameState] = useState<GameState>('playing');
  const [grid, setGrid] = useState<GridCellData[]>([]);
  const [inventory, setInventory] = useState<GamePiece[]>([]);
  const [laserPath, setLaserPath] = useState<Coordinate[]>([]);
  const [totalTime, setTotalTime] = useState(0);

  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: { distance: 5 },
  });
  
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 150, tolerance: 5 },
  });

  const sensors = useSensors(mouseSensor, touchSensor);

  // Loading Screen Timer
  useEffect(() => {
    if (appState === 'booting') {
      const timer = setTimeout(() => setAppState('active'), 3000);
      return () => clearTimeout(timer);
    }
  }, [appState]);

  const generateLevelData = (index: number) => {
    const config = LEVEL_CONFIGS[index];
    const newGrid: GridCellData[] = Array.from({ length: 36 }, (_, i) => {
      const row = Math.floor(i / 6);
      const col = i % 6;
      let piece: GamePiece | null = null;
      if (row === config.source.r && col === config.source.c) piece = { id: `source-${index}`, type: 'source', rotation: 90, emoji: '⚡', isStatic: true };
      else if (row === config.target.r && col === config.target.c) piece = { id: `target-${index}`, type: 'target', rotation: 0, emoji: '🤖', isStatic: true };
      else if (config.obstacles.some(obs => obs.r === row && obs.c === col)) piece = { id: `obs-${row}-${col}`, type: 'obstacle', rotation: 0, emoji: '🪨', isStatic: true };
      return { id: `cell-${row}-${col}`, row, col, piece };
    });
    const newInventory: GamePiece[] = config.inventory.map((rot, i) => ({ id: `inv-${index}-${i}`, type: 'mirror-angled' as PieceType, rotation: rot, emoji: '╱' }));
    return { newGrid, newInventory };
  };

  useEffect(() => {
    if (appState !== 'active') return;
    const data = generateLevelData(levelIndex);
    setGrid(data.newGrid);
    setInventory(data.newInventory);
    setGameState('playing');
  }, [levelIndex, appState]);

  // Speedrun Timer (Still tracking how long they take to beat all levels!)
  useEffect(() => {
    if (gameState !== 'playing' || appState !== 'active') return;
    const interval = setInterval(() => setTotalTime(prev => prev + 1), 1000);
    return () => clearInterval(interval);
  }, [gameState, appState]);

  // Laser Physics Engine
  useEffect(() => {
    if (grid.length === 0 || appState !== 'active') return;
    const sourceCell = grid.find(c => c.piece?.type === 'source');
    if (!sourceCell) return;
    let currentRow = sourceCell.row; let currentCol = sourceCell.col; let currentDir = 'RIGHT'; 
    const newPath: Coordinate[] = [{ row: currentRow, col: currentCol }];
    let loops = 0; let hitTarget = false;

    const calculateBounce = (incomingDir: string, rotation: number) => {
      const isForwardSlash = rotation === 0 || rotation === 180;
      if (isForwardSlash) {
        if (incomingDir === 'RIGHT') return 'UP';
        if (incomingDir === 'LEFT') return 'DOWN';
        if (incomingDir === 'DOWN') return 'LEFT';
        if (incomingDir === 'UP') return 'RIGHT';
      } else {
        if (incomingDir === 'RIGHT') return 'DOWN';
        if (incomingDir === 'LEFT') return 'UP';
        if (incomingDir === 'DOWN') return 'RIGHT';
        if (incomingDir === 'UP') return 'LEFT';
      }
      return null;
    };

    while (loops < 50) {
      loops++;
      if (currentDir === 'RIGHT') currentCol++; else if (currentDir === 'LEFT') currentCol--; else if (currentDir === 'DOWN') currentRow++; else if (currentDir === 'UP') currentRow--;
      if (currentRow < 0 || currentRow > 5 || currentCol < 0 || currentCol > 5) break;
      newPath.push({ row: currentRow, col: currentCol });
      const cell = grid.find(c => c.row === currentRow && c.col === currentCol);
      const piece = cell?.piece;

      if (piece) {
        if (piece.type === 'target') { hitTarget = true; break; }
        if (piece.type === 'obstacle') break;
        if (piece.type === 'mirror-angled') {
          const newDir = calculateBounce(currentDir, piece.rotation);
          if (newDir) currentDir = newDir; else break; 
        }
      }
    }
    
    setLaserPath(newPath);
    if (hitTarget && gameState === 'playing') {
      if (levelIndex + 1 >= LEVEL_CONFIGS.length) setGameState('victory');
      else setGameState('won');
    }
  }, [grid, gameState, levelIndex, appState]);

  const handleDragEnd = (event: DragEndEvent) => {
    if (gameState !== 'playing' || appState !== 'active') return;
    const { active, over } = event;
    if (!over) return;
    const draggedPiece = active.data.current as GamePiece;
    const targetId = over.id as string;
    const sourceCell = grid.find(c => c.piece?.id === draggedPiece.id);

    if (targetId === 'inventory-zone') {
      if (sourceCell) { 
        setGrid(prev => prev.map(c => c.id === sourceCell.id ? { ...c, piece: null } : c));
        setInventory(prev => [...prev, draggedPiece]);
      }
      return;
    }
    const targetCell = grid.find(c => c.id === targetId);
    if (targetCell?.piece) return; 
    if (!sourceCell) setInventory(prev => prev.filter(p => p.id !== draggedPiece.id));
    else setGrid(prev => prev.map(c => c.id === sourceCell.id ? { ...c, piece: null } : c));
    setGrid(prev => prev.map(cell => cell.id === targetId ? { ...cell, piece: draggedPiece } : cell));
  };

  const handleRotate = (pieceId: string) => {
    if (gameState !== 'playing' || appState !== 'active') return;
    setGrid(prev => prev.map(cell => {
      if (cell.piece?.id === pieceId && !cell.piece.isStatic) return { ...cell, piece: { ...cell.piece, rotation: (cell.piece.rotation + 90) % 360 } };
      return cell;
    }));
  };

  const getSvgCoordinates = (coord: Coordinate) => ({ x: coord.col * 62 + 30, y: coord.row * 62 + 30 });

  const handleRestart = () => {
    const data = generateLevelData(levelIndex);
    setGrid(data.newGrid);
    setInventory(data.newInventory);
  };

  const startNextLevel = () => {
    setLevelIndex(prev => prev + 1);
  };

  if (appState === 'booting') {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <h1>THE ELEVATOR SHAFT</h1>
          <div className="loading-bar-container">
            <div className="loading-bar"></div>
          </div>
          <p>INITIALIZING TERMINAL...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="game-container">
      <div className="header">
        <h1>The Elevator Shaft</h1>
        
        <div className="stats-bar">
          <div>
            <p>Level: {LEVEL_CONFIGS[levelIndex]?.id}</p>
            <p style={{ fontSize: '14px', color: '#888' }}>Total Time: {totalTime}s</p>
          </div>

          <div style={{ textAlign: 'right' }}>
            <button className="restart-btn" onClick={handleRestart}>Reset Board</button>
          </div>
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="main-layout">
          <div className="grid-container">
            <div className="shaft-grid">
              {grid.map(cell => <GridCell key={cell.id} cell={cell} onRotate={handleRotate} />)}
            </div>
            <svg style={{ pointerEvents: 'none', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10 }}>
              {laserPath.map((point, index) => {
                if (index === 0) return null;
                const prev = getSvgCoordinates(laserPath[index - 1]);
                const curr = getSvgCoordinates(point);
                return (
                  <line 
                    key={index} 
                    x1={prev.x} y1={prev.y} x2={curr.x} y2={curr.y} 
                    stroke="var(--accent)" 
                    strokeWidth="4" 
                    strokeLinecap="square" 
                    className="laser-beam" 
                  />
                );
              })}
            </svg>

            {gameState === 'won' && (
              <div className="overlay-screen">
                <h2>OVERRIDE SUCCESS!</h2>
                <button className="next-btn" onClick={startNextLevel}>Descend to Level {levelIndex + 2}</button>
              </div>
            )}
            {gameState === 'victory' && (
              <div className="overlay-screen" style={{ borderColor: '#4CAF50' }}>
                <h2 style={{ color: '#4CAF50', textShadow: '0 0 18px rgba(76, 175, 80, 0.6)' }}>ELEVATOR SECURED!</h2>
                <p style={{ color: 'white', fontFamily: "'JetBrains Mono', monospace", marginTop: '10px' }}>
                  You survived in {totalTime} seconds.
                </p>
                <button className="next-btn" style={{ backgroundColor: '#4CAF50', color: '#000', boxShadow: '0 4px 14px rgba(76, 175, 80, 0.3)' }} onClick={() => { setLevelIndex(0); setTotalTime(0); setGameState('playing'); }}>Play Again</button>
              </div>
            )}
          </div>
          <InventoryPanel inventory={inventory} />
        </div>
      </DndContext>
    </div>
  );
}