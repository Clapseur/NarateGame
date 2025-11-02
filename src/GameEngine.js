import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import figlet from 'figlet';
import boxen from 'boxen';
import inquirer from 'inquirer';
import { NarrativeSystem } from './NarrativeSystem.js';

export class GameEngine {
    constructor() {
        this.gameData = {};
        this.gameState = {
            joueur: null,
            inventaire: [],
            allies: [],
            position_histoire: 'introduction',
            traits: [],
            or: 100,
            experience: 0,
            niveau: 1,
            adventureLog: [],
            statistiques: {
                ennemis_vaincus: 0,
                objets_trouves: 0,
                decisions_prises: 0
            }
        };
        this.cheminSauvegardes = path.join(process.cwd(), 'saves');
        this.narrative = null;
    }

    // Initialisation du moteur de jeu
    async initialiser() {
        try {
            this.loadGameData();
            await this.creerDossierSauvegardes();
            this.narrative = new NarrativeSystem(this);
            console.log(chalk.green('✅ Moteur de jeu initialisé avec succès'));
        } catch (erreur) {
            console.error(chalk.red('❌ Erreur lors de l\'initialisation:'), erreur.message);
            throw erreur;
        }
    }

    // Chargement des données de jeu depuis les fichiers JSON
    loadGameData() {
        try {
            const dataPath = path.join(process.cwd(), 'data');
            this.gameData.classes = JSON.parse(fs.readFileSync(path.join(dataPath, 'classes.json'), 'utf8'));
            this.gameData.items = JSON.parse(fs.readFileSync(path.join(dataPath, 'items.json'), 'utf8'));
            this.gameData.enemies = JSON.parse(fs.readFileSync(path.join(dataPath, 'enemies.json'), 'utf8'));
            this.gameData.story = JSON.parse(fs.readFileSync(path.join(dataPath, 'story.json'), 'utf8'));
        } catch (error) {
            console.error(chalk.red('Erreur lors du chargement des données de jeu:'), error.message);
            process.exit(1);
        }
    }

    async creerDossierSauvegardes() {
        try {
            const savePath = path.join(process.cwd(), 'saves');
            if (!fs.existsSync(savePath)) {
                fs.mkdirSync(savePath, { recursive: true });
            }
        } catch (error) {
            console.error(chalk.red('Erreur lors de la création du dossier de sauvegardes:'), error.message);
            throw error;
        }
    }

    // Affichage du titre du jeu avec ASCII art
    async afficherTitre() {
        console.clear();
        const titre = figlet.textSync('DONJON', {
            font: 'Big',
            horizontalLayout: 'default',
            verticalLayout: 'default'
        });
        
        console.log(chalk.red.bold(titre));
        console.log(chalk.yellow('═'.repeat(60)));
        console.log(chalk.cyan.italic('Un RPG narratif en terminal'));
        console.log(chalk.yellow('═'.repeat(60)));
        console.log();
    }

    // Menu principal
    async menuPrincipal() {
        await this.afficherTitre();
        
        const choix = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'Que souhaitez-vous faire ?',
                choices: [
                    { name: '🎮 Nouvelle Partie', value: 'nouvelle' },
                    { name: '💾 Charger une Partie', value: 'charger' },
                    { name: '❓ Aide', value: 'aide' },
                    { name: '🚪 Quitter', value: 'quitter' }
                ]
            }
        ]);

        switch (choix.action) {
            case 'nouvelle':
                await this.nouvellePartie();
                break;
            case 'charger':
                const chargementReussi = await this.chargerPartie();
                if (chargementReussi) {
                    await this.narrative.continuerHistoire();
                }
                break;
            case 'aide':
                await this.afficherAide();
                break;
            case 'quitter':
                console.log(chalk.yellow('Merci d\'avoir joué à Donjon !'));
                process.exit(0);
        }
    }

    // Création d'un nouveau personnage
    async nouvellePartie() {
        console.clear();
        console.log(boxen(chalk.green.bold('CRÉATION DE PERSONNAGE'), {
            padding: 1,
            margin: 1,
            borderStyle: 'double',
            borderColor: 'green'
        }));

        // Sélection de la classe
        const classesDisponibles = Object.keys(this.gameData.classes).map(key => ({
            name: `${this.gameData.classes[key].nom} - ${this.gameData.classes[key].description}`,
            value: key
        }));

        const choixClasse = await inquirer.prompt([
            {
                type: 'list',
                name: 'classe',
                message: 'Choisissez votre classe :',
                choices: classesDisponibles
            }
        ]);

        // Saisie du nom
        const choixNom = await inquirer.prompt([
            {
                type: 'input',
                name: 'nom',
                message: 'Entrez le nom de votre personnage :',
                validate: (input) => input.length > 0 || 'Le nom ne peut pas être vide'
            }
        ]);

        // Initialisation du joueur
        this.initialiserJoueur(choixClasse.classe, choixNom.nom);
        
        // Démarrage de l'histoire via système narratif
        await this.demarrerHistoire();
    }

    // Initialisation des stats du joueur
    initialiserJoueur(classeId, nom) {
        const classeData = this.gameData.classes[classeId];
        
        this.gameState.joueur = {
            nom: nom,
            classe: classeId,
            niveau: 1,
            experience: 0,
            vie_max: classeData.stats.vie,
            vie_actuelle: classeData.stats.vie,
            energie_max: 50,
            energie_actuelle: 50,
            stats: { ...classeData.stats },
            competences: [...classeData.competences],
            equipement: [...classeData.equipement_initial]
        };

        // Ajout de l'équipement initial à l'inventaire
        classeData.equipement_initial.forEach(itemId => {
            this.ajouterItem(itemId);
        });

        console.log(boxen(
            chalk.green(`Personnage créé !\n`) +
            chalk.white(`Nom: ${nom}\n`) +
            chalk.cyan(`Classe: ${classeData.nom}\n`) +
            chalk.red(`Vie: ${classeData.stats.vie}\n`) +
            chalk.blue(`Attaque: ${classeData.stats.attaque}\n`) +
            chalk.yellow(`Défense: ${classeData.stats.defense}\n`) +
            chalk.magenta(`Vitesse: ${classeData.stats.vitesse}`),
            {
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'cyan'
            }
        ));
    }

    // Gestion de l'inventaire
    ajouterItem(itemId, quantite = 1) {
        const itemExistant = this.gameState.inventaire.find(item => item.id === itemId);
        if (itemExistant) {
            itemExistant.quantite += quantite;
        } else {
            this.gameState.inventaire.push({ id: itemId, quantite: quantite });
        }
    }

    retirerItem(itemId, quantite = 1) {
        const itemIndex = this.gameState.inventaire.findIndex(item => item.id === itemId);
        if (itemIndex !== -1) {
            this.gameState.inventaire[itemIndex].quantite -= quantite;
            if (this.gameState.inventaire[itemIndex].quantite <= 0) {
                this.gameState.inventaire.splice(itemIndex, 1);
            }
            return true;
        }
        return false;
    }

    // Système de sauvegarde
    async sauvegarderPartie(nom = 'sauvegarde_auto') {
        try {
            const savePath = path.join(process.cwd(), 'saves');
            if (!fs.existsSync(savePath)) {
                fs.mkdirSync(savePath, { recursive: true });
            }

            const saveData = {
                ...this.gameState,
                timestamp: new Date().toISOString(),
                version: '1.0.0'
            };

            const fileName = `${nom}_${Date.now()}.json`;
            const filePath = path.join(savePath, fileName);
            
            fs.writeFileSync(filePath, JSON.stringify(saveData, null, 2));
            
            console.log(chalk.green(`✅ Partie sauvegardée : ${fileName}`));
            return fileName;
        } catch (error) {
            console.error(chalk.red('❌ Erreur lors de la sauvegarde:'), error.message);
            return null;
        }
    }

    async chargerPartie() {
        try {
            const savePath = path.join(process.cwd(), 'saves');
            if (!fs.existsSync(savePath)) {
                console.log(chalk.yellow('Aucune sauvegarde trouvée.'));
                await this.attendreEntree();
                return await this.menuPrincipal();
            }

            const saveFiles = fs.readdirSync(savePath)
                .filter(file => file.endsWith('.json'))
                .map(file => {
                    const filePath = path.join(savePath, file);
                    const stats = fs.statSync(filePath);
                    return {
                        name: `${file} (${stats.mtime.toLocaleDateString()})`,
                        value: file
                    };
                });

            if (saveFiles.length === 0) {
                console.log(chalk.yellow('Aucune sauvegarde trouvée.'));
                await this.attendreEntree();
                return await this.menuPrincipal();
            }

            saveFiles.push({ name: '← Retour au menu principal', value: 'retour' });

            const choix = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'fichier',
                    message: 'Choisissez une sauvegarde :',
                    choices: saveFiles
                }
            ]);

            if (choix.fichier === 'retour') {
                return await this.menuPrincipal();
            }

            const saveData = JSON.parse(fs.readFileSync(path.join(savePath, choix.fichier), 'utf8'));
            this.gameState = saveData;
            
            console.log(chalk.green('✅ Partie chargée avec succès !'));
            await this.continuerHistoire();
            
        } catch (error) {
            console.error(chalk.red('❌ Erreur lors du chargement:'), error.message);
            await this.attendreEntree();
            return await this.menuPrincipal();
        }
    }

    // Utilitaires
    async attendreEntree() {
        await inquirer.prompt([
            {
                type: 'input',
                name: 'continuer',
                message: 'Appuyez sur Entrée pour continuer...'
            }
        ]);
    }

    // Vérifier si le joueur possède un objet
    possedeItem(itemId, quantiteRequise = 1) {
        const item = this.gameState.inventaire.find(item => item.id === itemId);
        return item && item.quantite >= quantiteRequise;
    }

    // Obtenir les données d'un objet
    obtenirDonneesItem(itemId) {
        for (const categorie of Object.values(this.gameData.items)) {
            if (categorie[itemId]) {
                return categorie[itemId];
            }
        }
        return null;
    }

    // Calculer les statistiques du joueur avec équipement
    calculerStatistiquesJoueur() {
        const stats = { ...this.gameState.joueur };
        
        // Ajouter les bonus d'équipement
        this.gameState.inventaire.forEach(item => {
            const itemData = this.obtenirDonneesItem(item.id);
            if (itemData && itemData.type === 'equipement' && itemData.equipe) {
                if (itemData.bonus_attaque) stats.attaque += itemData.bonus_attaque;
                if (itemData.bonus_defense) stats.defense += itemData.bonus_defense;
                if (itemData.bonus_vie) stats.vie_max += itemData.bonus_vie;
                if (itemData.bonus_energie) stats.energie_max += itemData.bonus_energie;
            }
        });
        
        return stats;
    }

    async afficherAide() {
        console.clear();
        const aide = boxen(
            chalk.white.bold('AIDE - DONJON RPG\n\n') +
            chalk.cyan('🎮 OBJECTIF:\n') +
            chalk.white('Explorez le donjon, combattez des ennemis, et découvrez ses secrets.\n\n') +
            chalk.cyan('⚔️ COMBAT:\n') +
            chalk.white('• Attaque: Inflige des dégâts à l\'ennemi\n') +
            chalk.white('• Défense: Réduit les dégâts reçus\n') +
            chalk.white('• Objet: Utilise un objet de votre inventaire\n') +
            chalk.white('• Fuir: Tentez d\'échapper au combat\n\n') +
            chalk.cyan('🎒 INVENTAIRE:\n') +
            chalk.white('Gérez vos objets, armes et armures.\n\n') +
            chalk.cyan('💾 SAUVEGARDE:\n') +
            chalk.white('Aucune sauvegarde automatique. Sauvegardez via ') + chalk.cyan('Ctrl+S') + chalk.white(' ou le choix ') + chalk.cyan('"💾 Sauvegarder la partie"') + chalk.white('.\n\n') +
            chalk.cyan('🏆 CLASSES:\n') +
            chalk.white('• Guerrier: Fort en combat rapproché\n') +
            chalk.white('• Mage: Maître des sorts destructeurs\n') +
            chalk.white('• Voleur: Rapide et discret\n') +
            chalk.white('• Paladin: Équilibré avec des pouvoirs divins'),
            {
                padding: 1,
                margin: 1,
                borderStyle: 'double',
                borderColor: 'blue'
            }
        );
        
        console.log(aide);
        await this.attendreEntree();
        return await this.menuPrincipal();
    }

    // Méthodes pour l'histoire - délégation au système narratif
    async demarrerHistoire() {
        this.gameState.position_histoire = 'introduction';
        if (this.narrative) {
            return await this.narrative.demarrerHistoire();
        }
    }

    async continuerHistoire() {
        if (this.narrative) {
            return await this.narrative.continuerHistoire();
        }
    }
}
