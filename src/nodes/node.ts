import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { Value } from "../types";
import { delay } from "../utils";

export async function node(
  nodeId: number, // the ID of the node
  N: number, // total number of nodes in the network
  F: number, // number of faulty nodes in the network
  initialValue: Value, // initial value of the node
  isFaulty: boolean, // true if the node is faulty, false otherwise
  nodesAreReady: () => boolean, // used to know if all nodes are ready to receive requests
  setNodeIsReady: (index: number) => void // this should be called when the node is started and ready to receive requests
) {

  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

  type NodeState = {
    killed: boolean; // this is used to know if the node was stopped by the /stop route. It's important for the unit tests but not very relevant for the Ben-Or implementation
    x: 0 | 1 | "?" | null; // the current consensus value
    decided: boolean | null; // used to know if the node reached finality
    k: number | null; // current step of the node
  };

  let state: NodeState = { //par défault on met ca
    killed: false,
    x: null,
    decided: null,
    k: null
  };

  let tab_x1: number[][] = []; //phase 1
  tab_x1[0] = [];

  let tab_x2: number[][] = []; //phase 2
  tab_x2[0] = [];


  // TODO implement this
  // this route allows retrieving the current status of the node
  node.get("/status", (req, res) => {
    if (isFaulty) {
      res.status(500).send("faulty");
    } else {
      res.status(200).send("live");
    }
  });

  // TODO implement this
  // get the current state of a node
  node.get("/getState", (req, res) => {
    if (state) {
      //state = {killed: false , x: initialValue, decided: false, k: 1};
      res.send(state);
    }
  });

  // TODO implement this
  // this route allows the node to receive messages from other nodes
  node.post("/message", async (req, res) => {
    let {phase, k, x} = req.body;

    if (!isFaulty && !state.killed) {

      //on a reçu un message, avant tout on check si la node est faulty
      if (phase == 1) {

        if (tab_x1[k] === undefined){ //au cas ou ca fait une erreur on le créé ici
          tab_x1[k] = [];
        }
        tab_x1[k].push(x); //on enregistre la valeur

        //on vérifie si
        if (tab_x1[k].length > (N - F)) {

          let compteur_x0 = tab_x1[k].filter((value) => value == 0).length;
          let compteur_x1 = tab_x1[k].filter((value) => value == 1).length;

          if (compteur_x0 > N / 2) {
            x = 0;
          } else if (compteur_x1 > N / 2) {
            x = 1;
          } else {
            x = "?";
          }

          //on fait la partie 2
          for (let i = 0; i < N; i++) {
            const goTo = BASE_NODE_PORT + i;
            const messageBody = {
              phase: 2,
              k: k,
              x: x
            };
            const requestBody = JSON.stringify(messageBody);

            const recu = await fetch(`http://localhost:${goTo}/message`, {
              method: 'POST', // Méthode POST
              headers: {
                'Content-Type': 'application/json'
              },
              body: requestBody
            })

          }

        }

      } else if (phase == 2) {

        if (tab_x2[k] === undefined){ //au cas ou ca fait une erreur on le créé ici
          tab_x2[k] = [];
        }
        tab_x2[k].push(x); //on enregistre la valeur

        if (tab_x2[k].length > (N - F)) {

          let compteur_x0 = tab_x2[k].filter((value) => value == 0).length;
          let compteur_x1 = tab_x2[k].filter((value) => value == 1).length;

          if (compteur_x0 > F + 1) {
            state.x = 0;
            state.decided = true;
          } else if (compteur_x1 > F + 1) {
            state.x = 1;
            state.decided = true;
          }
          else {

            if (compteur_x0 + compteur_x1 == 0) { //aucun 0 ni 1 on choisit aléatoirement
              state.x = Math.random() > 0.5 ? 1 : 0;
            }
            else { //pas trop compris cette partie
              if (compteur_x1 > compteur_x0) state.x = 1;
              else state.x = 0;
            }

            //dans ce cas uniquement on continue l'algo
            state.k = k + 1;

            //on renvoie en partie 1
            for (let i = 0; i < N; i++) {
              const goTo = BASE_NODE_PORT + i;
              const messageBody = {
                phase: 1,
                k: state.k,
                x: state.x
              };
              const requestBody = JSON.stringify(messageBody);

              const recu = await fetch(`http://localhost:${goTo}/message`, {
                method: 'POST', // Méthode POST
                headers: {
                  'Content-Type': 'application/json'
                },
                body: requestBody
              })

            }

          }


        }

      }
      res.status(200).send("Message received and processed.");

    }
    else res.status(500).send("Node stopped.");

  });

  // TODO implement this
  // this route is used to start the consensus algorithm
  node.get("/start", async (req, res) => {

    while(!nodesAreReady()) { //boucle infinie ?
      await delay(50);
    }

    if(!isFaulty){

      state.k = 1;
      state.x = initialValue;
      state.decided = false;

      //setNodeIsReady(nodeId);

      //on envoie un message à toutes les nodes
      for (let i = 0; i <N; i++)
      {
        const goTo = BASE_NODE_PORT + i;
        const messageBody = {
          phase: 1,
          k: state.k,
          x: state.x
        };
        const requestBody = JSON.stringify(messageBody);

        const recu = await fetch(`http://localhost:${goTo}/message`,{
          method: 'POST', // Méthode POST
          headers: {
            'Content-Type': 'application/json'
          },
          body: requestBody
        })

      }
    }
    else {

      res.status(200).send("Erreur Node Faulty");
    }

  });

  // TODO implement this
  // this route is used to stop the consensus algorithm
  node.get('/stop', (req, res) => {
    state.killed = true;
    res.send("Node stopped");
  });


  // start the server
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(
      `Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`
    );

    // the node is ready
    setNodeIsReady(nodeId);
  });

  return server;
}
