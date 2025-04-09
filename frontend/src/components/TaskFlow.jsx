import React, { useState, useEffect } from 'react';
import ReactFlow, { 
  MiniMap,
  Controls, 
  Background,
  useNodesState,
  useEdgesState,
  MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';

// Komponenta za prikaz čvora agenta
const AgentNode = ({ data }) => {
  // Određivanje klase stila na osnovu tipa agenta
  const agentTypeClass = data.type ? data.type.toLowerCase() : 'executor';
  
  // Formatiranje vremena
  const formattedTime = data.timestamp 
    ? new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '';
    
  // Skraćeni opis zadatka
  const taskSummary = data.message 
    ? data.message.length > 120 
      ? data.message.substring(0, 120) + '...' 
      : data.message
    : 'Nema opisa zadatka';
  
  return (
    <div className={`agent-node ${agentTypeClass}`}>
      <div className="font-bold text-white flex items-center justify-between">
        <span>{data.label}</span>
        {data.status && (
          <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
            data.status === 'completed' ? 'bg-green-800' : 
            data.status === 'in_progress' ? 'bg-yellow-800' : 
            data.status === 'error' ? 'bg-red-800' :
            'bg-gray-800'
          }`}>
            {data.status === 'completed' ? 'Završeno' : 
             data.status === 'in_progress' ? 'U toku' : 
             data.status === 'error' ? 'Greška' :
             data.status}
          </span>
        )}
      </div>
      
      {formattedTime && (
        <div className="text-xs text-gray-400 mt-1">
          {formattedTime}
        </div>
      )}
      
      <div className="mt-2 text-xs font-medium text-gray-300">Zadatak:</div>
      <div className="mt-1 p-2 bg-card-bg rounded text-xs overflow-hidden text-ellipsis backdrop-blur-sm" style={{ maxHeight: '80px' }}>
        {taskSummary}
      </div>
      
      {data.result && (
        <>
          <div className="mt-2 text-xs font-medium text-gray-300">Rezultat:</div>
          <div className="mt-1 p-2 bg-card-bg rounded text-xs overflow-hidden text-ellipsis backdrop-blur-sm" style={{ maxHeight: '60px' }}>
            {data.result.substring(0, 100)}{data.result.length > 100 ? '...' : ''}
          </div>
        </>
      )}
      
      {data.error && (
        <>
          <div className="mt-2 text-xs font-medium text-red-300">Greška:</div>
          <div className="mt-1 p-2 bg-red-900 bg-opacity-20 rounded text-xs overflow-hidden text-ellipsis backdrop-blur-sm text-red-300" style={{ maxHeight: '60px' }}>
            {data.error.substring(0, 100)}{data.error.length > 100 ? '...' : ''}
          </div>
        </>
      )}
      
      {data.onRerun && (
        <button 
          onClick={data.onRerun} 
          className="mt-3 px-3 py-1 bg-accent-blue hover:bg-blue-700 text-white rounded text-xs transition-all flex items-center"
        >
          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Pokreni ponovo
        </button>
      )}
      
      {data.phase && (
        <div className="mt-2 text-xs">
          <span className={`px-2 py-0.5 rounded-full ${
            data.phase === 'code_generation' ? 'bg-blue-900 bg-opacity-30 text-blue-300' :
            data.phase === 'execution' ? 'bg-green-900 bg-opacity-30 text-green-300' :
            data.phase === 'debug' ? 'bg-purple-900 bg-opacity-30 text-purple-300' :
            'bg-gray-800 text-gray-400'
          }`}>
            {data.phase === 'code_generation' ? 'Generiranje koda' :
             data.phase === 'execution' ? 'Izvršavanje' :
             data.phase === 'debug' ? 'Ispravljanje grešaka' :
             data.phase}
          </span>
        </div>
      )}
    </div>
  );
};

// Custom node types
const nodeTypes = {
  agent: AgentNode
};

const TaskFlow = ({ flowData, onRerun, workflowActive }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [showFlow, setShowFlow] = useState(false);
  
  // Generiši čvorove i veze na osnovu dobivenih podataka
  useEffect(() => {
    if (flowData) {
      // Workflow format je drugačiji od standardnog format
      if (flowData.workflowResult) {
        generateWorkflowNodes(flowData);
      } else if (flowData.flow && Array.isArray(flowData.flow)) {
        generateStandardNodes(flowData);
      } else {
        setShowFlow(false);
        setNodes([]);
        setEdges([]);
      }
    } else {
      setShowFlow(false);
      setNodes([]);
      setEdges([]);
    }
  }, [flowData, onRerun, workflowActive]);
  
  // Generira čvorove i veze za standardni tok (direktna komunikacija s agentima)
  const generateStandardNodes = (flowData) => {
    // Provjera da li treba prikazati flow - samo ako postoji više od jednog agenta 
    // ili je aktiviran specifičan agent koji nije samo Executor
    const shouldShowFlow = 
      flowData.flow.length > 1 || 
      (flowData.flow.length === 1 && flowData.flow[0].toLowerCase() !== "executor");
    
    setShowFlow(shouldShowFlow);
    
    if (shouldShowFlow) {
      // Kreiraj čvorove za svaki agent u toku
      const newNodes = flowData.flow.map((agentName, index) => {
        // Konverzija imena agenta u lowercase za konzistentnost
        const agentType = agentName.toLowerCase();
        
        // Pozicioniranje čvorova kao vertikalni niz
        return {
          id: `${agentType}-${index}`,
          type: 'agent',
          position: { x: 250, y: 100 + index * 200 }, // Povećan razmak između čvorova
          data: { 
            label: agentName,
            type: agentType,
            message: flowData.agents && flowData.agents[index],
            result: index > 0 && flowData.agents && flowData.agents[index],
            status: index < flowData.flow.length - 1 ? 'completed' : 'in_progress',
            timestamp: new Date().toISOString(),
            onRerun: onRerun ? () => onRerun(agentType, index) : undefined
          },
          // Dodajemo animaciju ulaska za nove čvorove
          style: { 
            opacity: 0, 
            transform: 'translateY(-20px)',
            animation: `fadeIn 0.5s ease ${index * 0.2}s forwards`,
            width: 300, // Fiksna širina za konzistentniji izgled
          }
        };
      });
      
      // Kreiraj veze između čvorova
      const newEdges = [];
      for (let i = 0; i < newNodes.length - 1; i++) {
        newEdges.push({
          id: `edge-${i}-to-${i + 1}`,
          source: newNodes[i].id,
          target: newNodes[i + 1].id,
          type: 'smoothstep',
          animated: true,
          style: { stroke: getEdgeColor(newNodes[i].data.type) },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: getEdgeColor(newNodes[i].data.type)
          },
          label: getEdgeLabel(newNodes[i].data.type, newNodes[i+1].data.type),
          labelStyle: { fill: '#f8fafc', fontSize: 10 },
          labelBgStyle: { fill: 'rgba(33, 33, 33, 0.7)', fillOpacity: 0.7 },
        });
      }
      
      setNodes(newNodes);
      setEdges(newEdges);
    } else {
      // Ako ne treba prikazati flow, resetiraj čvorove i veze
      setNodes([]);
      setEdges([]);
    }
  };
  
  // Generira čvorove i veze za automatski workflow
  const generateWorkflowNodes = (flowData) => {
    const workflow = flowData.workflowResult;
    
    if (!workflow) {
      setShowFlow(false);
      return;
    }
    
    setShowFlow(true);
    
    const newNodes = [];
    const newEdges = [];
    
    // 1. Executor node
    newNodes.push({
      id: 'executor-0',
      type: 'agent',
      position: { x: 250, y: 100 },
      data: { 
        label: 'Executor',
        type: 'executor',
        message: 'Upit proslijeđen odgovarajućem agentu',
        status: 'completed',
        timestamp: new Date().toISOString(),
        phase: 'routing'
      },
      style: { 
        opacity: 0, 
        transform: 'translateY(-20px)',
        animation: 'fadeIn 0.5s ease 0s forwards',
        width: 300
      }
    });
    
    // 2. Code agent (ako postoji)
    if (workflow.codeResult) {
      newNodes.push({
        id: 'code-1',
        type: 'agent',
        position: { x: 250, y: 300 },
        data: { 
          label: 'Code',
          type: 'code',
          message: workflow.codeResult.response.length > 200 ? 
                  workflow.codeResult.response.substring(0, 200) + '...' : 
                  workflow.codeResult.response,
          status: 'completed',
          timestamp: new Date().toISOString(),
          phase: 'code_generation',
          onRerun: onRerun ? () => onRerun('code', 1) : undefined
        },
        style: { 
          opacity: 0, 
          transform: 'translateY(-20px)',
          animation: 'fadeIn 0.5s ease 0.2s forwards',
          width: 300
        }
      });
      
      // Dodaj vezu od Executora do Code agenta
      newEdges.push({
        id: 'edge-executor-to-code',
        source: 'executor-0',
        target: 'code-1',
        type: 'smoothstep',
        animated: true,
        style: { stroke: getEdgeColor('executor') },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: getEdgeColor('executor')
        },
        label: 'generiranje koda',
        labelStyle: { fill: '#f8fafc', fontSize: 10 },
        labelBgStyle: { fill: 'rgba(33, 33, 33, 0.7)', fillOpacity: 0.7 },
      });
    }
    
    // 3. Execution node
    if (workflow.executionResult) {
      const executionStatus = workflow.executionResult.error ? 'error' : 'completed';
      
      newNodes.push({
        id: 'execution-2',
        type: 'agent',
        position: { x: 250, y: 500 },
        data: { 
          label: 'Izvršavanje',
          type: 'terminal',
          message: 'Izvršavanje generisanog koda',
          result: workflow.executionResult.output || 'Nema izlaznog rezultata',
          error: workflow.executionResult.error,
          status: executionStatus,
          timestamp: new Date().toISOString(),
          phase: 'execution'
        },
        style: { 
          opacity: 0, 
          transform: 'translateY(-20px)',
          animation: 'fadeIn 0.5s ease 0.4s forwards',
          width: 300
        }
      });
      
      // Dodaj vezu od prethodnog čvora do execution
      const previousNodeId = newNodes.length > 1 ? newNodes[newNodes.length - 2].id : 'executor-0';
      
      newEdges.push({
        id: `edge-to-execution`,
        source: previousNodeId,
        target: 'execution-2',
        type: 'smoothstep',
        animated: true,
        style: { stroke: getEdgeColor(previousNodeId.split('-')[0]) },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: getEdgeColor(previousNodeId.split('-')[0])
        },
        label: 'izvršavanje koda',
        labelStyle: { fill: '#f8fafc', fontSize: 10 },
        labelBgStyle: { fill: 'rgba(33, 33, 33, 0.7)', fillOpacity: 0.7 },
      });
    }
    
    // 4. Debugger node (ako postoji i ako je bilo grešaka)
    if (workflow.executionResult?.error && workflow.executionResult?.debugResult) {
      newNodes.push({
        id: 'debugger-3',
        type: 'agent',
        position: { x: 250, y: 700 },
        data: { 
          label: 'Debugger',
          type: 'debugger',
          message: 'Analiza i ispravljanje grešaka u kodu',
          result: workflow.executionResult.debugResult.length > 200 ? 
                 workflow.executionResult.debugResult.substring(0, 200) + '...' : 
                 workflow.executionResult.debugResult,
          status: 'completed',
          timestamp: new Date().toISOString(),
          phase: 'debug',
          onRerun: onRerun ? () => onRerun('debugger', 3) : undefined
        },
        style: { 
          opacity: 0, 
          transform: 'translateY(-20px)',
          animation: 'fadeIn 0.5s ease 0.6s forwards',
          width: 300
        }
      });
      
      // Dodaj vezu od execution do debugger
      newEdges.push({
        id: 'edge-execution-to-debugger',
        source: 'execution-2',
        target: 'debugger-3',
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#ef4444' }, // Crvena boja za grešku
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#ef4444'
        },
        label: 'otklanjanje grešaka',
        labelStyle: { fill: '#f8fafc', fontSize: 10 },
        labelBgStyle: { fill: 'rgba(33, 33, 33, 0.7)', fillOpacity: 0.7 },
      });
      
      // 5. Fixed execution node (ako postoji)
      if (workflow.fixedResult) {
        const fixedStatus = workflow.fixedResult.error ? 'error' : 'completed';
        
        newNodes.push({
          id: 'fixed-execution-4',
          type: 'agent',
          position: { x: 250, y: 900 },
          data: { 
            label: 'Ispravljeno izvršavanje',
            type: workflow.fixedResult.error ? 'error' : 'success',
            message: 'Ponovno izvršavanje ispravljenog koda',
            result: workflow.fixedResult.output || 'Nema izlaznog rezultata',
            error: workflow.fixedResult.error,
            status: fixedStatus,
            timestamp: new Date().toISOString(),
            phase: 'fixed_execution'
          },
          style: { 
            opacity: 0, 
            transform: 'translateY(-20px)',
            animation: 'fadeIn 0.5s ease 0.8s forwards',
            width: 300
          }
        });
        
        // Dodaj vezu od debugger do fixed execution
        newEdges.push({
          id: 'edge-debugger-to-fixed',
          source: 'debugger-3',
          target: 'fixed-execution-4',
          type: 'smoothstep',
          animated: true,
          style: { stroke: getEdgeColor('debugger') },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: getEdgeColor('debugger')
          },
          label: 'ponovno izvršavanje',
          labelStyle: { fill: '#f8fafc', fontSize: 10 },
          labelBgStyle: { fill: 'rgba(33, 33, 33, 0.7)', fillOpacity: 0.7 },
        });
      }
    }
    
    setNodes(newNodes);
    setEdges(newEdges);
  };
  
  // Helper funkcija za određivanje boje veza na osnovu tipa agenta
  function getEdgeColor(agentType) {
    switch (agentType) {
      case 'executor': return '#3b82f6'; // blue
      case 'code': return '#10b981'; // green
      case 'planner': return '#8b5cf6'; // purple
      case 'data': return '#f59e0b'; // amber
      case 'debugger': return '#ef4444'; // red
      case 'terminal': return '#64748b'; // slate
      case 'success': return '#22c55e'; // green
      case 'error': return '#ef4444'; // red
      default: return '#3b82f6'; // default blue
    }
  }
  
  // Helper funkcija za određivanje labele veze
  function getEdgeLabel(sourceType, targetType) {
    if (sourceType === 'executor') {
      switch (targetType) {
        case 'code': return 'generiranje koda';
        case 'planner': return 'planiranje';
        case 'data': return 'analiza podataka';
        case 'debugger': return 'debug';
        default: return 'delegira';
      }
    } else if (sourceType === 'planner' && targetType === 'code') {
      return 'implementacija';
    } else if (sourceType === 'code' && targetType === 'debugger') {
      return 'ispravljanje grešaka';
    }
    
    return 'obrađuje';
  }
  
  if (!showFlow) {
    return (
      <div className="glass-card h-full flex items-center justify-center text-center p-6">
        <div>
          <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
          </svg>
          <h3 className="text-lg font-medium text-gray-400">Vizualizacija toka rada</h3>
          <p className="mt-2 text-sm text-gray-500">
            Vizualni prikaz toka rada će se pojaviti kada se aktivira složeniji zadatak 
            koji uključuje više agenata ili specijalizirane operacije.
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="glass-card h-full">
      <style>
        {`
          @keyframes fadeIn {
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          .react-flow__attribution {
            background: transparent;
            color: rgba(255,255,255,0.3);
          }
          .agent-node {
            padding: 15px;
            border-radius: 8px;
            min-width: 220px;
          }
          .agent-node.executor {
            background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(37, 99, 235, 0.1));
            box-shadow: 0 0 15px rgba(59, 130, 246, 0.1);
            border-left: 2px solid rgba(59, 130, 246, 0.5);
          }
          .agent-node.code {
            background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(5, 150, 105, 0.1));
            box-shadow: 0 0 15px rgba(16, 185, 129, 0.1);
            border-left: 2px solid rgba(16, 185, 129, 0.5);
          }
          .agent-node.planner {
            background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(124, 58, 237, 0.1));
            box-shadow: 0 0 15px rgba(139, 92, 246, 0.1);
            border-left: 2px solid rgba(139, 92, 246, 0.5);
          }
          .agent-node.data {
            background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.1));
            box-shadow: 0 0 15px rgba(245, 158, 11, 0.1);
            border-left: 2px solid rgba(245, 158, 11, 0.5);
          }
          .agent-node.debugger {
            background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.1));
            box-shadow: 0 0 15px rgba(239, 68, 68, 0.1);
            border-left: 2px solid rgba(239, 68, 68, 0.5);
          }
          .agent-node.terminal {
            background: linear-gradient(135deg, rgba(100, 116, 139, 0.2), rgba(71, 85, 105, 0.1));
            box-shadow: 0 0 15px rgba(100, 116, 139, 0.1);
            border-left: 2px solid rgba(100, 116, 139, 0.5);
          }
          .agent-node.success {
            background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(21, 128, 61, 0.1));
            box-shadow: 0 0 15px rgba(34, 197, 94, 0.1);
            border-left: 2px solid rgba(34, 197, 94, 0.5);
          }
          .agent-node.error {
            background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(185, 28, 28, 0.1));
            box-shadow: 0 0 15px rgba(239, 68, 68, 0.1);
            border-left: 2px solid rgba(239, 68, 68, 0.5);
          }
        `}
      </style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
      >
        <MiniMap 
          style={{ 
            backgroundColor: 'rgba(15, 23, 42, 0.8)',
            maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.8), rgba(0,0,0,0.8))'
          }} 
          nodeColor={(n) => {
            switch (n.data?.type) {
              case 'executor': return '#3b82f6';
              case 'code': return '#10b981';
              case 'planner': return '#8b5cf6';
              case 'data': return '#f59e0b';
              case 'debugger': return '#ef4444';
              case 'terminal': return '#64748b';
              case 'success': return '#22c55e';
              case 'error': return '#ef4444';
              default: return '#3b82f6';
            }
          }}
        />
        <Controls position="bottom-right" />
        <Background variant="dots" gap={12} size={1} color="rgba(255,255,255,0.07)" />
      </ReactFlow>
    </div>
  );
};

export default TaskFlow;