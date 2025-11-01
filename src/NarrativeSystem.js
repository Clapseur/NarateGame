import chalk from 'chalk';
import boxen from 'boxen';
import inquirer from 'inquirer';
import { CombatSystem } from './CombatSystem.js';

export class NarrativeSystem {
    constructor(gameEngine) {
        this.game = gameEngine;
        this.combat = new CombatSystem(gameEngine);
        this.tempsDebut = Date.now();
    }

    // Démarrage du système narratif
    async demarrerHistoire() {
        this.game.gameState.position_histoire = 'introduction';
        await this.continuerHistoire();
    }

    // Continuation de l'histoire
    async continuerHistoire() {
        while (true) {
            const positionActuelle = this.game.gameState.position_histoire;
            const sceneData = this.game.gameData.story[positionActuelle];

            if (!sceneData) {
                console.error(chalk.red(`Erreur: Scène '${positionActuelle}' introuvable`));
                break;
            }

            // Vérifier si c'est une fin
            if (sceneData.type === 'fin') {
                await this.afficherFin(sceneData);
                break;
            }

            // Afficher la scène
            await this.afficherScene(sceneData);

            // Gestion des événements spéciaux de la scène
            const resultat = await this.gererEvenementsScene(sceneData);
            
            if (resultat === 'defaite') {
                await this.afficherGameOver();
                break;
            }

            // Autosave disabled per design; use manual save options or Ctrl+S
        }
    }

    // Affichage d'une scène
    async afficherScene(sceneData) {
        console.clear();
        
        // Titre de la scène
        console.log(boxen(
            chalk.yellow.bold(sceneData.titre),
            {
                padding: 1,
                margin: 1,
                borderStyle: 'double',
                borderColor: 'yellow'
            }
        ));

        // Texte principal
        console.log(chalk.white(sceneData.texte));
        console.log();

        // Texte conditionnel basé sur la classe
        if (sceneData.condition_classe) {
            const classeJoueur = this.game.gameState.joueur.classe;
            if (sceneData.condition_classe[classeJoueur]) {
                console.log(boxen(
                    chalk.cyan.italic(sceneData.condition_classe[classeJoueur]),
                    {
                        padding: 1,
                        borderStyle: 'round',
                        borderColor: 'cyan'
                    }
                ));
                console.log();
            }
        }

        await this.game.attendreEntree();
    }

    // Gestion des événements de la scène
    async gererEvenementsScene(sceneData) {
        // Gestion des objets trouvés
        if (sceneData.item_trouve) {
            await this.gererObjetTrouve(sceneData.item_trouve);
        }

        // Gestion des pièges
        if (sceneData.piege) {
            const resultatPiege = await this.gererPiege(sceneData.piege);
            if (resultatPiege === 'mort') {
                return 'defaite';
            }
        }

        // Gestion des rencontres avec des NPCs
        if (sceneData.npc_rencontre) {
            await this.gererRencontreNPC(sceneData.npc_rencontre);
        }

        // Gestion des combats
        if (sceneData.encounter) {
            const resultatCombat = await this.gererCombat(sceneData);
            if (resultatCombat === 'defaite') {
                return 'defaite';
            } else if (resultatCombat === 'fuite' && sceneData.choix_fuite) {
                this.game.gameState.position_histoire = sceneData.choix_fuite;
                return 'continue';
            } else if (resultatCombat === 'victoire' && sceneData.apres_combat) {
                this.game.gameState.position_histoire = sceneData.apres_combat;
                return 'continue';
            }
        }

        // Gestion des choix narratifs
        if (sceneData.choix) {
            await this.gererChoixNarratifs(sceneData.choix);
        }

        return 'continue';
    }

    // Gestion des objets trouvés
    async gererObjetTrouve(itemId) {
        const itemData = this.obtenirDonneesItem(itemId);
        if (itemData) {
            this.game.ajouterItem(itemId);
            this.game.gameState.statistiques.objets_trouves++;
            
            console.log(boxen(
                chalk.green.bold('🎁 OBJET TROUVÉ !\n\n') +
                chalk.white(`${itemData.nom}\n`) +
                chalk.gray(itemData.description),
                {
                    padding: 1,
                    margin: 1,
                    borderStyle: 'round',
                    borderColor: 'green'
                }
            ));
            
            await this.game.attendreEntree();
        }
    }

    // Gestion des pièges
    async gererPiege(piegeData) {
        console.log(chalk.red.bold('⚠️ PIÈGE DÉTECTÉ !'));
        
        let evite = false;
        
        // Vérifier si le joueur peut éviter le piège
        if (piegeData.esquivable_par) {
            const classeJoueur = this.game.gameState.joueur.classe;
            const aTraitPrudent = this.game.gameState.traits.includes('prudent');
            
            if (piegeData.esquivable_par.includes(classeJoueur) || 
                (piegeData.esquivable_par.includes('trait_prudent') && aTraitPrudent)) {
                evite = true;
            }
        }

        if (evite) {
            console.log(chalk.green('✅ Vous évitez habilement le piège !'));
        } else {
            console.log(chalk.red(`💥 Le piège se déclenche ! Vous subissez ${piegeData.degats} dégâts !`));
            this.game.gameState.joueur.vie_actuelle -= piegeData.degats;
            
            if (this.game.gameState.joueur.vie_actuelle <= 0) {
                return 'mort';
            }
        }

        await this.game.attendreEntree();
        return 'survie';
    }

    // Gestion des rencontres avec des NPCs
    async gererRencontreNPC(npcId) {
        const npcData = this.game.gameData.story.npcs[npcId];
        if (!npcData) return;

        console.log(boxen(
            chalk.blue.bold(`💬 ${npcData.nom}\n\n`) +
            chalk.white(npcData.dialogue_initial),
            {
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'blue'
            }
        ));

        // Gestion des quêtes
        if (npcData.quetes && npcData.quetes.length > 0) {
            await this.gererQuetesNPC(npcData);
        }

        // Possibilité de recrutement
        if (npcData.peut_rejoindre) {
            await this.gererRecrutementNPC(npcData, npcId);
        }

        await this.game.attendreEntree();
    }

    // Gestion des quêtes des NPCs
    async gererQuetesNPC(npcData) {
        for (const quete of npcData.quetes) {
            let queteComplete = false;
            
            // Vérifier les conditions de la quête
            if (quete.condition === 'avoir_cristal_lumiere') {
                const aCristal = this.game.gameState.inventaire.some(item => item.id === 'cristal_lumiere');
                if (aCristal) {
                    queteComplete = true;
                }
            }

            if (queteComplete) {
                console.log(chalk.green(`\n✅ Quête complétée: ${quete.nom}`));
                console.log(chalk.white(quete.description));
                
                // Donner la récompense
                this.game.ajouterItem(quete.recompense);
                const itemData = this.obtenirDonneesItem(quete.recompense);
                console.log(chalk.yellow(`🎁 Récompense reçue: ${itemData.nom}`));
            } else {
                console.log(chalk.yellow(`\n📋 Quête disponible: ${quete.nom}`));
                console.log(chalk.gray(quete.description));
            }
        }
    }

    // Gestion du recrutement des NPCs
    async gererRecrutementNPC(npcData, npcId) {
        let peutRecruter = true;
        
        // Vérifier les conditions de recrutement
        if (npcData.condition_recrutement) {
            const conditions = npcData.condition_recrutement;
            
            if (conditions.classe) {
                const classeJoueur = this.game.gameState.joueur.classe;
                if (!conditions.classe.includes(classeJoueur)) {
                    peutRecruter = false;
                }
            }
        }

        if (peutRecruter) {
            const choixRecrutement = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'recruter',
                    message: `Voulez-vous demander à ${npcData.nom} de vous accompagner ?`,
                    default: false
                }
            ]);

            if (choixRecrutement.recruter) {
                this.game.gameState.allies.push({
                    id: npcId,
                    nom: npcData.nom,
                    competences: npcData.competences_allie
                });
                
                console.log(chalk.green(`🤝 ${npcData.nom} se joint à votre groupe !`));
            }
        }
    }

    // Gestion des combats
    async gererCombat(sceneData) {
        let resultat;
        
        if (sceneData.encounter_multiple) {
            // Combat multiple
            for (let i = 0; i < sceneData.nombre_ennemis; i++) {
                console.log(chalk.yellow(`Combat ${i + 1}/${sceneData.nombre_ennemis}`));
                resultat = await this.combat.demarrerCombat(sceneData.encounter);
                
                if (resultat === 'defaite' || resultat === 'fuite') {
                    break;
                }
                
                // Récupération partielle entre les combats
                this.game.gameState.joueur.energie_actuelle = Math.min(
                    this.game.gameState.joueur.energie_max,
                    this.game.gameState.joueur.energie_actuelle + 10
                );
            }
        } else {
            // Combat simple
            resultat = await this.combat.demarrerCombat(sceneData.encounter);
        }

        return resultat;
    }

    // Gestion des choix narratifs
    async gererChoixNarratifs(choix) {
        // Filtrer les choix selon les conditions
        const baseChoix = choix.filter(option => {
            if (option.classe_requise) {
                return this.game.gameState.joueur.classe === option.classe_requise;
            }
            return true;
        });

        if (baseChoix.length === 0) {
            console.log(chalk.red('Aucun choix disponible. Fin de l\'aventure.'));
            return;
        }

        // Boucle jusqu'à ce qu'un choix narratif (hors sauvegarde) soit sélectionné
        while (true) {
            const choixFormates = [
                ...baseChoix.map(option => ({ name: option.texte, value: option })),
                new inquirer.Separator(),
                { name: '💾 Sauvegarder la partie', value: { __save__: true } }
            ];

            const selection = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'choix',
                    message: 'Que faites-vous ?',
                    choices: choixFormates
                }
            ]);

            const choixSelectionne = selection.choix;

            // Action de sauvegarde
            if (choixSelectionne.__save__) {
                const fileName = await this.game.sauvegarderPartie('manuel');
                if (fileName) {
                    console.log(chalk.green(`Partie sauvegardée: ${fileName}`));
                }
                await this.game.attendreEntree();
                // Reboucle sur le même écran
                continue;
            }

            // Ajouter le trait associé au choix
            if (choixSelectionne.trait) {
                if (!this.game.gameState.traits.includes(choixSelectionne.trait)) {
                    this.game.gameState.traits.push(choixSelectionne.trait);
                }
            }

            // Incrémenter le compteur de décisions
            this.game.gameState.statistiques.decisions_prises++;

            // Aller à la destination
            this.game.gameState.position_histoire = choixSelectionne.destination;
            break;
        }
    }

    // Affichage des fins
    async afficherFin(finData) {
        console.clear();
        
        const tempsJeu = Math.floor((Date.now() - this.tempsDebut) / 1000 / 60);
        
        console.log(boxen(
            chalk.gold.bold('🏆 FIN DE L\'AVENTURE 🏆\n\n') +
            chalk.yellow.bold(finData.titre + '\n\n') +
            chalk.white(finData.texte + '\n\n') +
            chalk.cyan(`⏱️ Temps de jeu: ${tempsJeu} minutes\n`) +
            chalk.green(`💰 Or final: ${this.game.gameState.or}\n`) +
            chalk.blue(`⭐ Expérience: ${this.game.gameState.experience}\n`) +
            chalk.red(`⚔️ Ennemis vaincus: ${this.game.gameState.statistiques.ennemis_vaincus}\n`) +
            chalk.magenta(`🎒 Objets trouvés: ${this.game.gameState.statistiques.objets_trouves}\n`) +
            chalk.yellow(`🤔 Décisions prises: ${this.game.gameState.statistiques.decisions_prises}`),
            {
                padding: 2,
                margin: 1,
                borderStyle: 'double',
                borderColor: 'gold'
            }
        ));

        if (finData.recompense) {
            console.log(chalk.green.bold('\n🎁 RÉCOMPENSES FINALES:'));
            if (finData.recompense.titre) {
                console.log(chalk.yellow(`👑 Titre obtenu: ${finData.recompense.titre}`));
            }
            if (finData.recompense.or) {
                this.game.gameState.or += finData.recompense.or;
                console.log(chalk.gold(`💰 Bonus d'or: ${finData.recompense.or}`));
            }
        }

        await this.game.attendreEntree();

        // Proposer de rejouer
        const rejouer = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'nouvelle',
                message: 'Voulez-vous commencer une nouvelle aventure ?',
                default: true
            }
        ]);

        if (rejouer.nouvelle) {
            // Réinitialiser le jeu
            this.game.gameState = {
                joueur: null,
                inventaire: [],
                allies: [],
                position_histoire: 'introduction',
                traits: [],
                or: 100,
                experience: 0,
                niveau: 1,
                statistiques: {
                    ennemis_vaincus: 0,
                    objets_trouves: 0,
                    decisions_prises: 0
                }
            };
            await this.game.menuPrincipal();
        } else {
            console.log(chalk.yellow('Merci d\'avoir joué à Donjon !'));
            process.exit(0);
        }
    }

    // Affichage du game over
    async afficherGameOver() {
        console.clear();
        
        console.log(boxen(
            chalk.red.bold('💀 GAME OVER 💀\n\n') +
            chalk.white('Votre aventure se termine ici...\n') +
            chalk.gray('Les ténèbres du donjon vous ont eu raison.'),
            {
                padding: 2,
                margin: 1,
                borderStyle: 'double',
                borderColor: 'red'
            }
        ));

        await this.game.attendreEntree();

        const rejouer = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'nouvelle',
                message: 'Voulez-vous tenter une nouvelle aventure ?',
                default: true
            }
        ]);

        if (rejouer.nouvelle) {
            await this.game.menuPrincipal();
        } else {
            process.exit(0);
        }
    }

    // Utilitaire pour obtenir les données d'un objet
    obtenirDonneesItem(itemId) {
        for (const categorie of Object.values(this.game.gameData.items)) {
            if (categorie[itemId]) {
                return categorie[itemId];
            }
        }
        return null;
    }

    // Affichage de l'inventaire (méthode utilitaire)
    async afficherInventaire() {
        console.clear();
        
        if (this.game.gameState.inventaire.length === 0) {
            console.log(chalk.yellow('Votre inventaire est vide.'));
            return;
        }

        console.log(boxen(
            chalk.blue.bold('🎒 INVENTAIRE\n\n') +
            this.game.gameState.inventaire.map(item => {
                const itemData = this.obtenirDonneesItem(item.id);
                return chalk.white(`• ${itemData.nom} x${item.quantite}\n  ${chalk.gray(itemData.description)}`);
            }).join('\n\n'),
            {
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'blue'
            }
        ));

        await this.game.attendreEntree();
    }
}
